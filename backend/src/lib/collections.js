/**
 * The complete JSON storage layout.
 *
 * Every collection maps to one file in /backend/data. Records are plain JSON
 * objects; collections marked `appendOnly` may only receive new records - the
 * store refuses updates and deletions for those files at write time.
 */
export const COLLECTIONS = Object.freeze({
  users: { file: "users.json", shape: "array" },
  properties: { file: "properties.json", shape: "array" },
  investments: { file: "investments.json", shape: "array" },
  investors: { file: "investors.json", shape: "array" },
  documents: { file: "documents.json", shape: "array" },
  propertyHashes: { file: "propertyHashes.json", shape: "array", appendOnly: true },
  transactions: { file: "transactions.json", shape: "array", appendOnly: true },
  resaleListings: { file: "resaleListings.json", shape: "array" },
  ownershipHistory: { file: "ownershipHistory.json", shape: "array", appendOnly: true },
  verificationRecords: { file: "verificationRecords.json", shape: "array", appendOnly: true },
  tokenRecords: { file: "tokenRecords.json", shape: "array", appendOnly: true },
  platformSettings: { file: "platformSettings.json", shape: "object" },
});

export const COLLECTION_NAMES = Object.keys(COLLECTIONS);
