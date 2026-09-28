# Centrix ERP — Sample AI Q&A: organization licence / subscription

Teaches Assistant + Talk to answer licence/expiry questions via **get_organization_license**.

**Import tip (Platform → AI training → Bulk paste):** each block is `Q:` / `A:` / optional `Path:`.

Also covered after backend deploy via Platform → AI training → **Install foundation notes**.

---

**Q: When does our Centrix licence expire?**  
**A: Call get_organization_license. Quote plan, status, expires_at, and days_remaining. Warn if about_to_expire. Never invent dates. Direct renewals to the Centrix administrator.**  

**Q: When does my license expire?**  
**A: Same as licence expiry — call get_organization_license (US spelling “license” is the same intent).**  

**Q: How many days are left on our subscription?**  
**A: Call get_organization_license; report days_remaining and the expiry date. If 0, say expires today.**  

**Q: Are we still on a Centrix trial?**  
**A: Call get_organization_license. If is_trial or status trialing, say yes and quote the trial end. Otherwise name the paid plan and expiry.**  

**Q: What is our licence status?**  
**A: Call get_organization_license. Summarize org name, plan, status, expiry, days remaining, seats if present.**  

**Q: Is our Centrix licence about to expire?**  
**A: Call get_organization_license. Yes when about_to_expire is true (within warning_days). Include exact date and days left.**  

**Q: Do we have an active Centrix subscription?**  
**A: Call get_organization_license. If status missing/expired, say no and that an administrator must activate/renew. If active/trialing/past_due, say yes with expiry.**  

**Q: What plan are we on?**  
**A: Call get_organization_license and quote plan_name (and trial flag if any).**  

**Q: How do I renew Centrix?**  
**A: Call get_organization_license first so you can state current expiry, then tell the user to contact their Centrix administrator to renew or extend. Do not invent payment links.**  

**Q: How long do we have left on Centrix?**  
**A: Call get_organization_license; answer with days_remaining and expires_at.**  

**Q: Subscription renewal — when is it due?**  
**A: Call get_organization_license; the due/expiry date is expires_at (and renewal_price if present).**  

**Q: Has our Centrix licence already expired?**  
**A: Call get_organization_license. If expired is true or days_remaining < 0 or status expired/missing, say yes and that access needs renewal by a Centrix administrator.**  
