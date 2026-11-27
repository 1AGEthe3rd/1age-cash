# Spatial Design 006 — Cash currency interface
Independent walkable prototype at spatial/index.html. Cash is an internal credit interface, not a cryptocurrency, bank, trading venue or treasury. The future $1AGE Treasury belongs in HQ2 Washington, D.C.; no Treasury code or token issuance is included.

## Fast interaction
- One-tap Cash shortcut from anywhere in the environment, plus interactive floating Cash centerpiece and E/interact controls.
- Balance, Add Cash, Activity, Use Cash. Example $5/$10/$20 amount selection is visual only. Checkout is disabled and no example balance is presented as real.
- Account actions remain accessible if WebGL initialization fails. No wallet needed.
- Provisional SVG icon and rotating 3D representation: candidate shared visual identity for game pickups, rewards and purchase controls. Founder approval required before adopting it across applications.
- Existing secure account interface remains linked; no new identity flow or duplicate ledger. Current production portal explicitly requires the original Godot World; this independent scene is isolated to the new branch for founder review under the newer spatial design direction.

## Transaction architecture for later implementation
Each app can use its own interface with a versioned Cash client and shared visual asset. The existing authenticated backend must be the single authoritative balance and ledger. Keep identity credential in memory, use server-verified transaction intents and idempotency keys, atomic balance checks and ledger updates, explicit purchase confirmation, verified payment webhooks and a receipt. Never grant spendable credit from an animation or trust client prices. A pending response must not show final success; reconcile interrupted requests before retrying. Keep balance and history accurate after failure, duplicate requests and refunds. No unnecessary wallet signatures, page transitions or account registration prompts. External checkout may require additional authentication. No claimed processing latency until measured.

## Release gates
Preserve existing production Cash portal, Railway, PostgreSQL, Keycloak and Stripe configuration. No live purchases, redemption, registration, transfer or backend modifications. No HQ2 change. Browser/device visual tests, keyboard/gamepad tests, 3D fallback test, safe-area layout, and measured UI responsiveness remain pending. Reuses existing local Three.js, gamepad and Earth assets with Page architecture/walking modules pinned to c1414ed39f45d4c0ea7b87895c708f2f61e84b49. HQ1 is the visual benchmark, not verified parity. Review concurrent changes and obtain approval before merge or changing production domain entry.
