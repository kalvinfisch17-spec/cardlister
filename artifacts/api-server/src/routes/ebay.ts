import { Router } from "express";
import {
  getEbayAuthUrl,
  exchangeCodeForTokens,
  getSavedToken,
  saveTokens,
  getEbayUsername,
} from "../lib/ebay";
import { db } from "@workspace/db";
import { ebayTokensTable } from "@workspace/db";

const router = Router();

// GET /ebay/status
router.get("/status", async (req, res) => {
  try {
    const token = await getSavedToken();
    if (!token) {
      res.json({ connected: false, username: null, expiresAt: null });
      return;
    }
    res.json({
      connected: true,
      username: token.username ?? null,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get eBay status");
    res.json({ connected: false, username: null, expiresAt: null });
  }
});

// GET /ebay/auth-url
router.get("/auth-url", (req, res) => {
  const url = getEbayAuthUrl("cardlister");
  res.json({ url });
});

// GET /ebay/callback
router.get("/callback", async (req, res) => {
  const { code } = req.query as { code?: string; state?: string };
  if (!code) {
    res.redirect("/?ebay=error");
    return;
  }
  try {
    const tokens = await exchangeCodeForTokens(code);
    let username: string | undefined;
    try {
      username = await getEbayUsername(tokens.access_token);
    } catch {
      username = undefined;
    }
    await saveTokens(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      username,
    );
    res.redirect("/settings?ebay=connected");
  } catch (err) {
    req.log.error({ err }, "eBay callback failed");
    res.redirect("/settings?ebay=error");
  }
});

// POST /ebay/disconnect
router.post("/disconnect", async (req, res) => {
  try {
    await db.delete(ebayTokensTable);
    res.json({ connected: false, username: null, expiresAt: null });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect eBay");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

export default router;
