/** Pure constants/types shared between the server-side broadcaster
 *  (lib/realtime.ts) and the client-side subscriber
 *  (components/realtime/feed-listener.tsx). Kept in their own file with
 *  zero imports: lib/realtime.ts pulls in lib/errorLog.ts (which imports
 *  the Node-only `postgres` driver via db/index.ts) — if the client
 *  component imported these from lib/realtime.ts directly, that whole
 *  chain would get bundled into the browser (same class of bug documented
 *  on WalletLedgerList/lib/ledger-format.ts). */

export const FEED_TOPIC = "duelo:feed";
export const FEED_BROADCAST_EVENT = "feed_update";

export type FeedEvent =
  | { type: "bet_created"; matchId: string }
  | { type: "bet_accepted"; betId: string; matchId: string; creatorId: string }
  | { type: "bet_cancelled"; betId: string; matchId: string }
  | { type: "bets_settled"; matchId: string }
  | { type: "bets_voided"; matchId: string }
  | { type: "bets_refunded" };
