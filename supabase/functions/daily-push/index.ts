import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@quantumopselite.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function formatNaira(n: number) {
  return "₦" + Math.round(n || 0).toLocaleString("en-NG");
}

function getLocalDateString(d: Date) {
  // Nigeria is UTC+1
  const nigeria = new Date(d.getTime() + 60 * 60 * 1000);
  return nigeria.toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

function todayStr() {
  return getLocalDateString(new Date());
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const slot = url.searchParams.get("slot") || "morning"; // morning | noon | afternoon | evening

    // Get all companies that have at least one push subscription
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("company_id, endpoint, subscription");

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No subscriptions" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group subscriptions by company
    const byCompany = new Map<string, any[]>();
    for (const s of subs) {
      if (!s.company_id) continue;
      if (!byCompany.has(s.company_id)) byCompany.set(s.company_id, []);
      byCompany.get(s.company_id)!.push(s);
    }

    let sent = 0;
    let skipped = 0;

    for (const [companyId, companySubs] of byCompany) {
      // ---- Load business data ----
      const yStr = yesterdayStr();
      const tStr = todayStr();

      const [salesY, salesT, debtors, products] = await Promise.all([
        supabase
          .from("sales")
          .select("total_amount, total, profit, total_profit, created_at")
          .eq("company_id", companyId)
          .gte("created_at", yStr + "T00:00:00")
          .lt("created_at", tStr + "T00:00:00"),
        supabase
          .from("sales")
          .select("total_amount, total, profit, total_profit, created_at")
          .eq("company_id", companyId)
          .gte("created_at", tStr + "T00:00:00"),
        supabase
          .from("debtors")
          .select("customer_name, amount_owing")
          .eq("company_id", companyId),
        supabase
          .from("products")
          .select("name, stock, items_per_pack")
          .eq("company_id", companyId),
      ]);

      const yesterdaySales = (salesY.data || []).reduce(
        (a, s) => a + Number(s.total_amount ?? s.total ?? 0),
        0
      );
      const yesterdayProfit = (salesY.data || []).reduce(
        (a, s) => a + Number(s.profit ?? s.total_profit ?? 0),
        0
      );
      const todaySales = (salesT.data || []).reduce(
        (a, s) => a + Number(s.total_amount ?? s.total ?? 0),
        0
      );
      const todayProfit = (salesT.data || []).reduce(
        (a, s) => a + Number(s.profit ?? s.total_profit ?? 0),
        0
      );
      const todayCount = (salesT.data || []).length;

      const debtList = debtors.data || [];
      const debtTotal = debtList.reduce((a, d) => a + Number(d.amount_owing || 0), 0);
      const debtCount = debtList.length;

      const lowStock = (products.data || []).filter((p) => {
        const pack = Number(p.items_per_pack || 24) || 24;
        const units = Number(p.stock || 0) / pack;
        return Number(p.stock || 0) > 0 && units <= 3;
      });

      // ---- Build smart message based on slot ----
      let title = "Quantum OPS Elite";
      let body = "";
      let url = "/dashboard.html";
      let shouldSend = true;

      if (slot === "morning") {
        title = "Good morning!";
        const parts = [];
        parts.push(`Yesterday you made ${formatNaira(yesterdaySales)} in sales.`);
        if (debtCount > 0) {
          parts.push(`You have ${debtCount} outstanding debt${debtCount > 1 ? "s" : ""} totaling ${formatNaira(debtTotal)}.`);
        }
        if (lowStock.length > 0) {
          parts.push(`${lowStock.length} product${lowStock.length > 1 ? "s are" : " is"} running low.`);
        }
        body = parts.join(" ") + " Tap to see today’s briefing.";
        url = "/ai-ceo.html";
      } else if (slot === "noon") {
        title = "How’s business today?";
        if (todayCount === 0) {
          body = "Your business hasn’t recorded a sale yet today. Remember to record every transaction in Quantum OPS Elite.";
        } else {
          body = `You’ve made ${formatNaira(todaySales)} so far today. Keep tracking every sale — your numbers tell the story.`;
        }
        url = "/pos.html";
      } else if (slot === "afternoon") {
        if (debtCount === 0) {
          title = "Great job!";
          body = "You currently have no outstanding customer debts.";
        } else {
          title = "You have money waiting for you";
          body = `${debtCount} customer${debtCount > 1 ? "s" : ""} currently owe you ${formatNaira(debtTotal)}. Open your debtors list and follow up.`;
        }
        url = "/debtors.html";
      } else if (slot === "evening") {
        title = "Today’s business summary";
        body = `Sales: ${formatNaira(todaySales)} · Profit: ${formatNaira(todayProfit)} · Transactions: ${todayCount} · Outstanding debts: ${formatNaira(debtTotal)}. Tap to review.`;
        url = "/transactions.html";
      } else {
        shouldSend = false;
      }

      if (!shouldSend || !body) {
        skipped++;
        continue;
      }

      // ---- Send to every device of this company ----
      const payload = JSON.stringify({
        title,
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        url,
      });

      for (const sub of companySubs) {
        try {
          await webpush.sendNotification(sub.subscription, payload);
          sent++;
        } catch (err: any) {
          // Remove dead subscriptions
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          console.error("Push failed:", err?.message || err);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, slot, sent, skipped }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
