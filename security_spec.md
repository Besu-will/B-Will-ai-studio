# B-WILL Firestore Security Rules Specification (Phase 0 TDD)

## Data Invariants
1. **Zero Self-Escalation**: A player cannot assign `role: 'admin'`, modify `balance`, `totalWagered`, `totalWon`, `winsCount`, `gamesPlayed`, or `isBanned` on their own `/players/{userId}` document.
2. **PII Isolation**: Player email addresses live solely under `/players/{userId}/private/{docId}` and are readable only by the owning user or an admin.
3. **Unique Username Integrity**: A username claim in `/usernames/{usernameLower}` can only be created when `ownerUid == request.auth.uid`, matching `^[a-zA-Z0-9_]+$` (3-20 chars), and cannot be reassigned.
4. **Bet Integrity**: A bet in `/bets/{betId}` must belong to `request.auth.uid`, target an existing round in `BETTING` phase, specify `slotIndex` in `[1, 2]`, `selectedColor` in `['GREEN', 'BLUE', 'ORANGE']`, `stake > 0`, `status == 'pending'`, and `payout == 0`.
5. **Terminal Locking & State Transitions**: Settled bets (`status != 'pending'`), processed transactions (`status != 'pending'`), and revealed rounds (`phase == 'REVEAL'`) cannot be altered by non-admins.
6. **Transaction Integrity**: Players can only create `deposit` or `withdrawal` transactions with `status == 'pending'` and `amount > 0`; players can only cancel their own `withdrawal` while `status == 'pending'`. Only admins can `approve` or `reject` transactions.
7. **Admin-Only Settings & Rounds**: Only verified admins can modify `/settings/{settingId}`, `/rounds/{roundId}`, or `/admins/{userId}`.

## Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Admin Escalation**: Player writes `/players/{uid}` with `role: 'admin'`.
2. **Balance Forgery**: Player updates `/players/{uid}` setting `balance: 999999`.
3. **Shadow Field Injection**: Player creates `/players/{uid}` with extra field `isVip: true`.
4. **PII Snooping**: User A reads `/players/{userB}/private/info`.
5. **Username Hijack**: User A overwrites `/usernames/alice` owned by User B.
6. **Spoofed Email Admin**: Unverified token (`email_verified: false`) with `email: 'outstandiiing@gmail.com'` tries to update `/settings/game`.
7. **Winning Bet Forgery**: Player creates `/bets/{betId}` with `status: 'won'` and `payout: 5000`.
8. **Slot Overflow**: Player creates `/bets/{betId}` with `slotIndex: 3` or `selectedColor: 'RED'`.
9. **Post-Settlement Tampering**: Player updates `/bets/{betId}` after `status == 'lost'` back to `selectedColor: 'GREEN'`.
10. **Fake Approved Deposit**: Player creates `/transactions/{txId}` with `type: 'deposit'` and `status: 'approved'`.
11. **Cancel Other User's Withdrawal**: User A updates User B's `/transactions/{txId}` to `status: 'cancelled'`.
12. **Oversized ID Poisoning**: Client writes `/bets/{1500_char_id}` to exhaust rules/storage.
