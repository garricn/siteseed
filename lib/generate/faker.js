const nameHeuristics = [
  { pattern: "firstname", gen: (f) => f.person.firstName() },
  { pattern: "lastname", gen: (f) => f.person.lastName() },
  { pattern: "name", gen: (f) => f.person.fullName(), exact: true },
  { pattern: "phone", gen: (f) => f.phone.number() },
  { pattern: "phonenumber", gen: (f) => f.phone.number() },
  { pattern: "address", gen: (f) => f.location.streetAddress() },
  { pattern: "city", gen: (f) => f.location.city() },
  { pattern: "state", gen: (f) => f.location.state() },
  { pattern: "zip", gen: (f) => f.location.zipCode() },
  { pattern: "zipcode", gen: (f) => f.location.zipCode() },
  { pattern: "postalcode", gen: (f) => f.location.zipCode() },
  { pattern: "country", gen: (f) => f.location.country() },
  { pattern: "company", gen: (f) => f.company.name() },
  { pattern: "companyname", gen: (f) => f.company.name() },
  { pattern: "url", gen: (f) => f.internet.url(), exact: true },
  { pattern: "website", gen: (f) => f.internet.url() },
  { pattern: "avatar", gen: (f) => f.image.url() },
  { pattern: "image", gen: (f) => f.image.url(), exact: true },
  { pattern: "photo", gen: (f) => f.image.url() },
  { pattern: "description", gen: (f) => f.lorem.sentence() },
  { pattern: "bio", gen: (f) => f.lorem.sentence() },
  { pattern: "about", gen: (f) => f.lorem.sentence() },
  { pattern: "title", gen: (f) => f.lorem.words(3), exact: true },
  { pattern: "price", gen: (f) => Number(f.commerce.price()) },
  { pattern: "amount", gen: (f) => Number(f.commerce.price()) },
  { pattern: "cost", gen: (f) => Number(f.commerce.price()) },
  { pattern: "email", gen: (f) => f.internet.email() },
];

function matchNameHeuristic(fieldName, faker) {
  const lower = fieldName.toLowerCase();
  for (const h of nameHeuristics) {
    if (h.exact ? lower === h.pattern : lower === h.pattern) {
      return h.gen(faker);
    }
  }
  return undefined;
}

const formatGenerators = {
  email: (f) => f.internet.email(),
  uuid: (f) => f.string.uuid(),
  "date-time": (f) => f.date.recent().toISOString(),
  date: (f) => f.date.recent().toISOString().split("T")[0],
  uri: (f) => f.internet.url(),
  phone: (f) => f.phone.number(),
};

/**
 * Generate a value for a single entity field.
 *
 * Priority: enum > $ref > name heuristic > type+format
 *
 * @param {object} field - Entity field from DSC-1
 * @param {object} faker - Faker instance
 * @returns {any}
 */
export function generateFieldValue(field, faker) {
  // 1. Enum always wins
  if (field.enum) {
    return faker.helpers.arrayElement(field.enum);
  }

  // 2. $ref → placeholder null
  if (field.$ref) {
    return null;
  }

  // 3. Name-based heuristic (only for string/number types without format)
  if ((field.type === "string" || field.type === "number") && !field.format) {
    const heuristic = matchNameHeuristic(field.name, faker);
    if (heuristic !== undefined) return heuristic;
  }

  // 4. Type + format mapping
  switch (field.type) {
    case "string": {
      if (field.format && formatGenerators[field.format]) {
        return formatGenerators[field.format](faker);
      }
      return faker.lorem.word();
    }
    case "number": {
      if (field.format === "integer") {
        return faker.number.int({ min: 1, max: 10000 });
      }
      return faker.number.float({ min: 0, max: 10000, fractionDigits: 2 });
    }
    case "boolean":
      return faker.datatype.boolean();
    case "array":
      return [];
    case "object":
      return null;
    default:
      return faker.lorem.word();
  }
}

/**
 * Generate a complete entity record with values for all fields.
 *
 * @param {object} entity - Entity with name and fields from DSC-1
 * @param {object} faker - Faker instance
 * @returns {object} Record with field names as keys
 */
export function generateEntity(entity, faker) {
  const record = {};
  for (const field of entity.fields) {
    record[field.name] = generateFieldValue(field, faker);
  }
  return record;
}
