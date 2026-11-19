# Manual live Picnic test

Automated tests never contact Picnic. Use this checklist with your own account before relying on the live integration, and again after upgrading `picnic-api`.

## Setup

1. `cp .env.example .dev.vars`, then set:
   - `PICNIC_MODE=live`
   - `PICNIC_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)`
   - `PICNIC_CHECKOUT_ENABLED=false` (keep it off for steps 1–6)
2. `pnpm dev` and open http://127.0.0.1:5173.
3. Complete onboarding (or use your existing data) and plan 3 days.

## Steps

| # | Action | Expected |
| --- | --- | --- |
| 1 | Instellingen → Picnic → log in with e-mail + password. | “Picnic heeft een sms-code gestuurd” (if 2FA applies). No password in the network response, logs or D1 (`SELECT * FROM project73_integrations` shows only ciphertext). |
| 2 | Enter the SMS code. | “Gekoppeld met Picnic”. “Test verbinding” shows your real cart count. |
| 3 | Boodschappen → “Zoek boodschappen bij Picnic”. | Real product names, prices, package sizes; no DEMO labels. Check 3–4 matches by hand, especially chicken, eggs (pieces), wraps (multipack) and tuna (drained weight). |
| 4 | Pick another product for one item; mark one item “Niet nodig”. | Totals update; the other item disappears from the cart preview. |
| 5 | Put one unrelated product in your cart via the Picnic app. “Bekijk wijzigingen”. | The unrelated product is listed as untouched; only planned products are added. |
| 6 | “Vul mijn Picnic-winkelmandje”, then press “Bekijk wijzigingen” again. | Cart updated once; the second preview says “al up-to-date”. Verify in the Picnic app: no duplicates, unrelated product still there. |
| 7 | “Toon bezorgmomenten” and pick a slot. | Slots match the Picnic app; the selection is visible in the Picnic app. |
| 8 | Handoff: “Rond af in de Picnic-app”. | Cart is ready in the app. The app does **not** claim an order was placed. |

## Optional: direct checkout (places a real order)

Only with a small cart you actually want delivered.

1. Set `PICNIC_CHECKOUT_ENABLED=true`, restart, and enable “Direct bestellen” in Instellingen → Picnic.
2. Boodschappen → Bestellen: check the totals, tick the confirmation, press “Bestelling goedkeuren”.
3. You are redirected to your bank. Approve the payment.
4. Back in the app the status changes from “Wacht op betaling” to “Bestelling bevestigd door Picnic” with an order number. Verify the order in the Picnic app.
5. Press the button twice quickly, or reload during the payment: no second order is started (“Er loopt al een bestelling”).
6. Change the cart in the Picnic app before approving: the app stops with “Prijs gewijzigd: er is niets besteld”.

If any step fails, set `PICNIC_CHECKOUT_ENABLED=false` again and use the handoff.

## Clean up

Instellingen → Picnic → Ontkoppelen (deletes the stored key and logs out), or Instellingen → Mijn gegevens to remove everything.
