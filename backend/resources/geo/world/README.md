# Countries States Cities Database snapshot

Source: https://github.com/dr5hn/countries-states-cities-database
Release: `v4.0-export.51`, 2026-10-12.
Download: https://github.com/dr5hn/countries-states-cities-database/releases/download/v4.0-export.51/json-countries+states+cities.json.gz

License: Open Database License (ODbL) 1.0, reproduced in `LICENSE.txt`. This license concerns the derived geographic data, not application source code. Attribution and a download of the complete derived snapshot are available at `/datos-geograficos` and `/geography-data/world.zip`.

Transformed by `scripts/prepare-geography.py`: retain ISO2 country codes, upstream state/city IDs, Spanish country names where supplied, subdivision and city names; omit coordinates and unrelated metadata. Country JSONs contain only their states and cities; request handlers never load the whole world. `source.json` records the source archive SHA256. IDs and parent relationships are validated server-side. Rebuilds are explicit, not automatic updates.

Colombia is deliberately excluded from the world country files and served separately from the DANE DIVIPOLA snapshot in the parent directory, under CC BY-SA 4.0. These datasets do not verify a postal address or carrier coverage. Missing regions/cities can be entered manually in the private profile, with no claim that such values were validated against the database.
