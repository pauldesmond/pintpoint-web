# View the live tap list for a specific pub or brewery

Each venue in PINtPOINT has a public page showing beers currently on tap, with a freshness indicator per beer based on Untappd check-in recency. Useful when a user asks "what's on tap at [pub name]?" or "is [beer] pouring at [pub]?"

## URL format

`https://pintpoint.co.uk/pubs/<slug>`

The `<slug>` is the venue name lowercased, non-alphanumerics replaced with hyphens. Examples:
- `the-white-swan`
- `bar-arbolada`
- `moody-goose-brewery`

If an exact slug isn't known, start at the index `https://pintpoint.co.uk/pubs/` and search.

## What's on each venue page

- Address, rating, distance from city centre
- Full live tap list: beer name, brewery, style, ABV, freshness dot (≤3 days green, 4-10 amber, >10 red)
- "Open in PINtPOINT" deep link to the mobile app

## Data source

Tap lists pulled from Untappd check-in activity. A beer appears if someone checked in with it recently — strong signal but not a guaranteed live pour. Refreshed every 24h.
