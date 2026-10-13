/**
 * The shape a reviewer's client gets for a user's verification documents.
 *
 * No URL of any kind goes out - not the Cloudinary public id either. Just an
 * index and a path on our own API, which the reviewer's browser fetches with
 * their admin JWT attached. That keeps the only route to a CNIC behind
 * authentication, rather than behind a link that works for whoever ends up
 * holding it.
 *
 * Shared by the REST listing and the live socket event so an admin screen that
 * gained a row without a refresh behaves identically to one that reloaded.
 */
export const toReviewableDocs = (user) =>
  (user.verificationDocs || []).map((doc, index) => ({
    index,
    // Records written before these became private are plain URL strings.
    docType: typeof doc === 'string' ? undefined : doc.docType,
    fileName: typeof doc === 'string' ? '' : doc.fileName || '',
    viewPath: `/admin/verifications/${user._id.toString()}/docs/${index}`,
  }));
