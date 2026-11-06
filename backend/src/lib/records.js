import { AppError } from "./errors.js";

export function findById(records, id, label = "Record") {
  const record = records.find((item) => item.id === id);
  if (!record) throw AppError.notFound(`${label} ${id} was not found.`);
  return record;
}

export function findProperty(properties, id) {
  return findById(properties, id, "Property");
}

export function findDocument(documents, id) {
  return findById(documents, id, "Document");
}

export function findInvestment(investments, id) {
  return findById(investments, id, "Investment");
}

export function findResaleListing(listings, id) {
  return findById(listings, id, "Resale listing");
}
