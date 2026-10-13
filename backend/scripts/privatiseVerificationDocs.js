import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { v2 as cloudinary } from 'cloudinary';

// Verification documents uploaded before config/cloudinary.js started passing
// `type: 'private'` are still served by Cloudinary's default delivery type,
// which means the URL on its own is enough for anyone to fetch somebody's CNIC
// - no login and no expiry. This moves those assets to private delivery and
// records the public id on each document so the admin review endpoint can sign
// a short-lived URL for it.
//
// Dry run by default. Pass --apply to make changes:
//   node scripts/privatiseVerificationDocs.js
//   node scripts/privatiseVerificationDocs.js --apply
//
// Re-runnable: a document that already has a publicId is skipped, and an asset
// Cloudinary reports as already private is recorded without being moved again.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Pulls the public id and resource type back out of a stored delivery URL.
 *
 * Shape: /<cloud>/<resource_type>/<delivery_type>/[s--sig--/][v<version>/]<public_id>[.<ext>]
 * The signature and version segments are both optional, and only image URLs
 * carry an extension - a raw asset's public id is the whole tail.
 */
export function parseCloudinaryUrl(url) {
  const match = /\/(image|raw|video)\/(upload|private|authenticated)\/(.+)$/.exec(url || '');
  if (!match) return null;

  const [, resourceType, deliveryType, tail] = match;

  const publicId = tail
    .split('/')
    .filter((seg) => !/^s--[\w-]+--$/.test(seg)) // signature
    .filter((seg) => !/^v\d+$/.test(seg)) // version
    .join('/')
    // Only image assets have the format appended; a raw public id keeps its
    // tail verbatim, so stripping an extension there would corrupt it.
    .replace(resourceType === 'image' ? /\.[a-z0-9]+$/i : /$^/, '');

  return publicId ? { publicId, resourceType, deliveryType } : null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection('users');

  const affected = await users
    .find(
      { 'verificationDocs.0': { $exists: true } },
      { projection: { verificationDocs: 1, name: 1, email: 1 } }
    )
    .toArray();

  let docsSeen = 0;
  let docsConverted = 0;
  let docsSkipped = 0;
  const problems = [];

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - ${affected.length} user(s) with documents\n`);

  for (const user of affected) {
    const docs = user.verificationDocs || [];
    const next = [];
    let changed = false;

    for (const [i, doc] of docs.entries()) {
      docsSeen++;

      // Already migrated.
      if (doc && typeof doc === 'object' && doc.publicId) {
        docsSkipped++;
        next.push(doc);
        continue;
      }

      const url = typeof doc === 'string' ? doc : doc?.url;
      const parsed = parseCloudinaryUrl(url);

      if (!parsed) {
        problems.push(`${user.email} doc[${i}]: could not parse URL`);
        next.push(doc);
        continue;
      }

      const { publicId, resourceType, deliveryType } = parsed;
      const base = typeof doc === 'string' ? {} : doc;

      if (!APPLY) {
        console.log(`  ${user.email} doc[${i}]: ${deliveryType} -> private  (${resourceType}) ${publicId}`);
        docsConverted++;
        next.push(doc);
        continue;
      }

      try {
        if (deliveryType !== 'private') {
          await cloudinary.uploader.rename(publicId, publicId, {
            resource_type: resourceType,
            type: deliveryType,
            to_type: 'private',
            overwrite: true,
          });
        }

        next.push({
          ...base,
          // Dropped deliberately: for a private asset the stored URL is either
          // dead or (if signed) valid forever, and neither belongs in the
          // database. The admin endpoint signs a fresh one per request.
          url: '',
          publicId,
          resourceType: resourceType === 'raw' ? 'raw' : 'image',
        });
        changed = true;
        docsConverted++;
        console.log(`  ✓ ${user.email} doc[${i}]: ${publicId}`);
      } catch (err) {
        const reason = err?.error?.message || err?.message || String(err);
        // An asset that is already private reports "not found" against the
        // 'upload' delivery type. Record it rather than treating it as a failure.
        if (/not found/i.test(reason)) {
          next.push({ ...base, url: '', publicId, resourceType: resourceType === 'raw' ? 'raw' : 'image' });
          changed = true;
          docsConverted++;
          console.log(`  ✓ ${user.email} doc[${i}]: already private, recorded`);
        } else {
          problems.push(`${user.email} doc[${i}]: ${reason}`);
          next.push(doc);
        }
      }
    }

    if (APPLY && changed) {
      await users.updateOne({ _id: user._id }, { $set: { verificationDocs: next } });
    }
  }

  console.log(`\nDocuments seen:      ${docsSeen}`);
  console.log(`Already migrated:    ${docsSkipped}`);
  console.log(`${APPLY ? 'Converted' : 'Would convert'}:   ${docsConverted}`);

  if (problems.length) {
    console.log(`\n${problems.length} problem(s) - these were left untouched:`);
    for (const p of problems) console.log(`  ! ${p}`);
  }

  if (!APPLY && docsConverted > 0) {
    console.log('\nNothing was changed. Re-run with --apply to convert.');
  }

  await mongoose.disconnect();
}

// Importable for tests without connecting to anything. pathToFileURL, not a
// hand-built "file://" + path: on Windows the latter yields file://D:/... while
// import.meta.url is file:///D:/..., so the comparison never matched and the
// script exited silently having done nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
