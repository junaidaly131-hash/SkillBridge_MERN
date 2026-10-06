// Clears every credit artefact left over from sandbox testing, keeping only the
// one genuine purchase.
//
// Everything in the database before go-live was created against Safepay's
// sandbox, where no money moves. Those balances become real the moment the
// production keys are switched on: earned credits are cashable, so a leftover
// test balance turns into a bank transfer. This empties them while the cost of
// doing so is still zero.
//
//   node scripts/resetSandboxCredits.js            # dry run, changes nothing
//   node scripts/resetSandboxCredits.js --execute  # apply
//
// The keeper account is matched by email, and the script refuses to run if that
// account or its completed purchase cannot be found - better to stop than to
// wipe the one row that matters.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const KEEP_EMAIL = 'juanidalikhan03@gmail.com';
const EXECUTE = process.argv.includes('--execute');

const EMPTY_WALLET = {
  balance: 0,
  purchasedBalance: 0,
  earnedBalance: 0,
  totalEarned: 0,
  totalSpent: 0,
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 45000 });
  const db = mongoose.connection;

  const users = db.collection('users');
  const wallets = db.collection('creditwallets');
  const creditTx = db.collection('credittransactions');
  const payments = db.collection('transactions');
  const payouts = db.collection('payoutrequests');

  console.log(EXECUTE ? '*** EXECUTING ***\n' : '*** DRY RUN - nothing will be changed ***\n');

  // ---- locate and sanity-check the account being preserved ----------------
  const keeper = await users.findOne({ email: KEEP_EMAIL });
  if (!keeper) {
    throw new Error(`Refusing to run: no user with email ${KEEP_EMAIL}`);
  }

  const keptPurchase = await payments.findOne({ user: keeper._id, status: 'completed' });
  if (!keptPurchase) {
    throw new Error(`Refusing to run: ${KEEP_EMAIL} has no completed purchase to preserve`);
  }

  const keptCreditRow = await creditTx.findOne({ user: keeper._id, type: 'purchase' });
  if (!keptCreditRow) {
    throw new Error(`Refusing to run: ${KEEP_EMAIL} has no purchase credit row to preserve`);
  }

  console.log(`Preserving ${keeper.name} <${keeper.email}>`);
  console.log(`  payment  : ${keptPurchase.amountPaid} ${keptPurchase.currency} -> ${keptPurchase.creditsGranted} credits`);
  console.log(`  credit   : ${keptCreditRow.type} +${keptCreditRow.amount}`);
  console.log(`  wallet   : will be set to purchased=${keptPurchase.creditsGranted}, earned=0\n`);

  // ---- 1. wallets ---------------------------------------------------------
  // Orphans (their user is gone) are deleted outright; the rest are emptied,
  // because a live account still needs a wallet to log in against.
  const allWallets = await wallets.find({}).toArray();
  const liveUserIds = new Set((await users.find({}, { projection: { _id: 1 } }).toArray()).map((u) => String(u._id)));

  const orphans = allWallets.filter((w) => !liveUserIds.has(String(w.user)));
  const toEmpty = allWallets.filter(
    (w) => liveUserIds.has(String(w.user)) && String(w.user) !== String(keeper._id)
  );

  console.log(`Wallets: ${allWallets.length} total`);
  console.log(`  delete (owner no longer exists): ${orphans.length}`);
  console.log(`  empty  (live accounts)         : ${toEmpty.length}`);
  console.log(`  keep   (rebuilt from purchase) : 1`);

  // ---- 2. credit transactions --------------------------------------------
  const creditKeepIds = [keptCreditRow._id];
  const creditDeleteCount = await creditTx.countDocuments({ _id: { $nin: creditKeepIds } });
  console.log(`\nCredit transactions: deleting ${creditDeleteCount}, keeping ${creditKeepIds.length}`);

  // ---- 3. payment transactions -------------------------------------------
  // The keeper's own abandoned attempt goes too: left pending, a later poll or
  // webhook could still settle it and grant a second 100 credits.
  const paymentDeleteCount = await payments.countDocuments({ _id: { $ne: keptPurchase._id } });
  const keeperPending = await payments.countDocuments({ user: keeper._id, status: 'pending' });
  console.log(`Payment transactions: deleting ${paymentDeleteCount}, keeping 1`);
  if (keeperPending) {
    console.log(`  (includes ${keeperPending} abandoned pending attempt on the kept account)`);
  }

  // ---- 4. payout requests -------------------------------------------------
  const payoutCount = await payouts.countDocuments({});
  console.log(`Payout requests: deleting ${payoutCount}`);

  if (!EXECUTE) {
    console.log('\nNothing was changed. Re-run with --execute to apply.');
    await mongoose.disconnect();
    return;
  }

  // ---- apply --------------------------------------------------------------
  const r1 = await wallets.deleteMany({ _id: { $in: orphans.map((w) => w._id) } });
  const r2 = await wallets.updateMany(
    { _id: { $in: toEmpty.map((w) => w._id) } },
    { $set: EMPTY_WALLET }
  );
  const r3 = await wallets.updateOne(
    { user: keeper._id },
    { $set: { ...EMPTY_WALLET, balance: keptPurchase.creditsGranted, purchasedBalance: keptPurchase.creditsGranted } }
  );
  const r4 = await creditTx.deleteMany({ _id: { $nin: creditKeepIds } });
  const r5 = await payments.deleteMany({ _id: { $ne: keptPurchase._id } });
  const r6 = await payouts.deleteMany({});

  console.log('\nApplied:');
  console.log(`  orphan wallets deleted : ${r1.deletedCount}`);
  console.log(`  wallets emptied        : ${r2.modifiedCount}`);
  console.log(`  keeper wallet set      : ${r3.modifiedCount}`);
  console.log(`  credit rows deleted    : ${r4.deletedCount}`);
  console.log(`  payments deleted       : ${r5.deletedCount}`);
  console.log(`  payout requests deleted: ${r6.deletedCount}`);

  // ---- verify -------------------------------------------------------------
  console.log('\nVerifying:');
  const w = await wallets.findOne({ user: keeper._id });
  console.log(`  keeper wallet: balance=${w.balance} purchased=${w.purchasedBalance} earned=${w.earnedBalance} totalEarned=${w.totalEarned} totalSpent=${w.totalSpent}`);

  const cashableLeft = (await wallets.find({ earnedBalance: { $gt: 0 } }).toArray())
    .reduce((s, x) => s + x.earnedBalance, 0);
  const purchasedLeft = (await wallets.find({}).toArray())
    .reduce((s, x) => s + (x.purchasedBalance || 0), 0);
  console.log(`  cashable credits anywhere : ${cashableLeft} (expected 0)`);
  console.log(`  purchased credits anywhere: ${purchasedLeft} (expected ${keptPurchase.creditsGranted})`);
  console.log(`  credit rows remaining     : ${await creditTx.countDocuments()} (expected 1)`);
  console.log(`  payments remaining        : ${await payments.countDocuments()} (expected 1)`);
  console.log(`  payout requests remaining : ${await payouts.countDocuments()} (expected 0)`);

  const ok =
    cashableLeft === 0 &&
    purchasedLeft === keptPurchase.creditsGranted &&
    (await creditTx.countDocuments()) === 1 &&
    (await payments.countDocuments()) === 1 &&
    (await payouts.countDocuments()) === 0;
  console.log(ok ? '\nAll checks passed.' : '\nSOMETHING IS OFF - review the figures above.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
