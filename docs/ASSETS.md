# Local visual assets

Interior photographs are stored locally in `public/images/`. The running app does not contact an image CDN. In v0.2 they are limited to room cards and a compact desktop room identifier; Home no longer uses a photographic hero. No new visual assets were added. They illustrate the sample home and do not represent a customer’s actual rooms.

v0.3 uses these photos only in mock mode. Core exposes no room-image contract;
real room cards use a neutral surface and omit photographic identifiers.

| File | Download source |
| --- | --- |
| `living-room.jpg` | https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=80&fm=jpg |
| `kitchen.jpg` | https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=800&q=80&fm=jpg |
| `bedroom.jpg` | https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=800&q=80&fm=jpg |
| `office.jpg` | https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80&fm=jpg |

Source provider: [Unsplash](https://unsplash.com/). See its [image license](https://unsplash.com/license). Keep this provenance with the files; use product-owned imagery when the product’s final visual identity is established.

Manrope is locally served through `@fontsource-variable/manrope`; its package includes the SIL Open Font License. Lucide icons use the ISC license. The favicon and house wordmark are repository-native SVGs, with no remote font, tracking script, or runtime asset service.
