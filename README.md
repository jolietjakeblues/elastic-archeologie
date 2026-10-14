# Archeologie SDO/Elastic demo

> **Dit is een demo.** Bouw hier geen applicaties of andere afhankelijkheden op. De scripts, index en service kunnen zonder aankondiging wijzigen of verdwijnen.

Een webdemo die laat zien wat Elasticsearch bovenop de SDO/Linked Data-publicatie van de RCE-dataset [`archeologie-sdo`](https://linkeddata.cultureelerfgoed.nl/rce/archeologie-sdo) mogelijk maakt. In één index staan archeologische onderzoeksgebieden, vondstlocaties, terreinen, complexen, grondsporen en vondsten. De demo kan fulltext en Booleaans zoeken, facetten tonen (soort, periode, materiaal, ABR-typegroep, stijl, waardering, plaats), filteren en sorteren op datering in jaartallen (uit het ABR), relaties volgen (wat ligt waarin, ook over alle niveaus van een onderzoeksgebied), en zoeken in de buurt van een object. Er is een kaart en elk resultaat linkt naar Linked Data.

**Online:** <https://elastic-archeologie.jolietjakeblues64.workers.dev/>

Voorbeelden:

- [Metalen vondsten die helemaal in 800–12 v. Chr. vallen, chronologisch](https://elastic-archeologie.jolietjakeblues64.workers.dev/?van=-800&tot=-12&jaarmodus=binnen&soort=vondsten&materiaal=metaal&sorteer=periode)
- [Alles in onderzoeksgebied 2041587, alle niveaus](https://elastic-archeologie.jolietjakeblues64.workers.dev/?binnen=archeologischonderzoeksgebied:2041587)
- [Alles in vondstlocatie Kletterstraat (Lochem)](https://elastic-archeologie.jolietjakeblues64.workers.dev/?binnen=vondstlocatie:6129412)
- [Zwaarden](https://elastic-archeologie.jolietjakeblues64.workers.dev/?q=zwaard)

Zusterdemo van de [Erfgoed SDO/Elastic demo](https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/) ([repo](https://github.com/jolietjakeblues/elastic-erfgoed---geo); rijksmonumenten, complexen, gezichten, werelderfgoed). Zoeksyntax, facetlogica, deelbare URL, CSV-export, kaart en huisstijl werken hetzelfde. Beide bouwen voort op de oorspronkelijke [Rijksmonumenten SDO/Elastic demo](https://rijksmonumenten-sdo-elastic-demo.jolietjakeblues64.workers.dev/) ([repo](https://github.com/jolietjakeblues/elastic)).

## Data

De dataset wordt gevuld met CONSTRUCT-queries op het RCE CHO-endpoint, als job in TriplyDB (bron `rce/cho`, doel `rce/archeologie-sdo`). Elke query schrijft naar een eigen graph. De queries staan in [`archeologie/`](archeologie/). Aantallen in de index op 14 oktober 2026:

| Query | Graph | Soort (URI) | Aantal | schema.org | Geometrie | Ligt in |
|---|---|---|---:|---|---|---|
| `0-archeologische-terreinen.rq` | `archeologischeterreinen-sdo` | `archeologischterrein` | 13.025 | `Place` | vlak van het rijksmonument (1.812) | rijksmonument (erfgoed-sdo) |
| `1-onderzoeksgebieden.rq` | `onderzoeksgebieden-sdo` | `archeologischonderzoeksgebied` | 113.434 | `Place` | eigen vlak | – |
| `2-vondstlocaties.rq` | `vondstenlocaties-sdo` | `vondstlocatie` | 111.854 | `Place` | vlak van het onderzoeksgebied (ca. 40.000) | onderzoeksgebied |
| `3-archeologische-complexen.rq` | `archeologische-complexen` | `archeologischcomplex` | 360.390 | `Place` | – | vondstlocatie, terrein of onderzoeksgebied |
| `4-grondsporen.rq` | `grondsporen-sdo` | `grondsporen` | 92.641 | `CreativeWork` | – | vondstlocatie (`locationCreated`) |
| `5-vondsten.rq` | `vondsten-sdo` | `vondsten` | 446.708 | `CreativeWork` | – | vondstlocatie (`spatialCoverage`) |

Samen 1.138.052 documenten. Draai je een query opnieuw naar een graph met een andere naam, verwijder dan de oude graph: Elasticsearch maakt per URI één document uit alle graphs samen, dus oude en nieuwe waarden komen dan in één document.

Afspraken in de queries:

- **Onderzoeksgebied, alle niveaus.** Vondsten, grondsporen en complexen in een vondstlocatie krijgen in `schema:isPartOf` het onderzoeksgebied waarin die vondstlocatie ligt.
- **Plat.** Alleen het object zelf is subject. Elk subject wordt in Elasticsearch een eigen document; hulpknopen (bijv. `schema:PropertyValue` met een `#…`-URI) zouden als extra "objecten" in de index en de soortfacet verschijnen.
- **Nummer** (`schema:identifier`) is de CHOI, gelijk aan het getal aan het eind van de URI. Archis-nummers staan als tekst in `schema:alternateName` ("vondstnummer 25404", "waarnemingsnummer 2963").
- **Type** van complexen, grondsporen en vondsten: het rn-concept in `schema:additionalType`, het ABR-label in `schema:name` (zie *Verrijking uit ABR*).
- **Periode** in `schema:temporalCoverage` als tekst ("Romeinse Tijd - Nieuwe Tijd Laat"), met jaartallen in `startDate` en `endDate`.
- **Overig**: materiaal (`material`), stijl en cultuur (`genre`), aantal (`materialExtent`), toestand (`itemCondition`), waardering van een terrein (`category`), wijze van verwerving en AMK-indicatie (`keywords`), vertrouwelijkheid (`conditionsOfAccess`; bij complexen, sporen en vondsten overgenomen van het object waarin ze liggen).
- `formeelStandpunt` staat bij de archeologische omschrijvingen meestal op `false`; er wordt daarom niet op gefilterd.
- Labels van gemeente en provincie worden met hun pad in één `OPTIONAL` opgehaald. Los van elkaar matcht een lege variabele met alle labels in `graph:owms` (time-out).

**Testopzet:** vertrouwelijke objecten zitten erin, met geometrie (1.902 onderzoeksgebieden, 19 vondstlocaties). Houd de dataset intern zolang dat zo is; op 14 oktober 2026 staat hij nog op *public*.

### Verrijking uit ABR

De concepten in de archeologiedata (`…/term/id/rn/2/<uuid>`) hebben in het Archeologisch Basisregister dezelfde UUID (`…/term/id/abr/2/<uuid>`). De queries voor complexen, grondsporen en vondsten koppelen daarom met `REPLACE` op de URI aan de graph `https://data.cultureelerfgoed.nl/term/id/abr/2/thesaurus` in het CHO-endpoint (ca. 99,7% van de gebruikte concepten heeft een ABR-tegenhanger). Er komt geen ABR-graph in de dataset of index; alleen de waarden die nodig zijn komen als gewone velden op het object:

| Veld | Inhoud | Voorbeeld |
|---|---|---|
| `schema:name` | ABR-label van het type (anders het rn-label) | "greppel / sloot" |
| `schema:sameAs` | het ABR-concept | `…/term/id/abr/2/32945e55…` |
| `schema:keywords` | bovenliggende ABR-begrippen van het type, zonder topconcept | kuil → "grondspoor" |
| `schema:material` | materiaal plus bovenliggende begrippen, zonder topconcept (alleen vondsten) | ijzer, metaal, anorganisch |
| `schema:startDate` / `endDate` | `rnce:beginYearAbr` van de beginperiode en `rnce:endYearAbr` van de eindperiode; negatief = v. Chr. | Romeinse Tijd: −12 en 449 |

Haal ABR uit het CHO-endpoint, niet met `SERVICE` uit de thesaurusdataset: die levert per aanroep maximaal 10.000 rijen.

**Snelheid (Virtuoso).** De ABR-URI is berekend (`BIND`). Een `skos:broader+`-pad direct op die variabele, of `skos:broader*`, laat Virtuoso per object alle 13.623 ABR-concepten aflopen; de jobs schoten daardoor niet op. Daarom begint elke ABR-zoekactie in een eigen `OPTIONAL` met een gewone triple op het concept (`?abr skos:prefLabel …`) en staat het `broader+`-pad daarbinnen. Het rn-label wordt alleen opgehaald als ABR geen label heeft. Gemeten op 2.000 objecten: vondsten 12,5 s, grondsporen 4,0 s, complexen 3,7 s (eerst een time-out na 57 s).

## Service

```text
POST https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/archeologie-sdo/services/Archeologie-sdo-abr/_search
```

De service wordt gemaakt met de index template [`triply/elastic-service-archeologie.json`](triply/elastic-service-archeologie.json): dezelfde als `Erfgoed-sdo-nl3` (Nederlandse taalverwerking, `@id.soort` uit de URI, `geo:asWKT` als `geo_shape`, `identifier.getal` als `long`), plus `materialExtent.getal`, `startDate.getal` en `endDate.getal` (jaartallen als `long`, voor het bereikfilter en chronologisch sorteren). Aanmaken met een token met *Management access*, in PowerShell:

```bash
curl.exe -H "Authorization: Bearer $env:TRIPLY_TOKEN" -H "Content-Type: application/json" -X POST "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/archeologie-sdo/services" -d "@triply/elastic-service-archeologie.json"
```

Templates worden alleen bij het aanmaken gelezen; een wijziging betekent de service opnieuw aanmaken. Een andere service proberen kan met `?service=<naam>` in de URL van de demo (alleen services van `rce/archeologie-sdo`).

## Wat de demo doet

- **Bladeren zonder vondsten en grondsporen.** Samen ca. 540.000 van de 1,1 miljoen objecten; anders bestaat het overzicht vooral uit losse vondsten. Met een zoekvraag worden ze wel getoond (wie op "zwaard" zoekt, zoekt vooral vondsten). Zonder zoekvraag, soortfilter en gekozen object staat in `post_filter` een `terms` op `@id.soort` met de andere vier soorten. De soortfacet telt zonder dat filter.
- **Ligt in** bij elk resultaat: het object uit `containedInPlace`, `locationCreated` of `spatialCoverage`. Vondsten, grondsporen en complexen in een vondstlocatie tonen ook het **Onderzoeksgebied** (`isPartOf`).
- **Rijksmonument** (waarin een terrein ligt): staat in `erfgoed-sdo`. Nummer en naam komen met een tweede request uit de service `Erfgoed-sdo-nl3`; de link opent het monument in de [erfgoeddemo](https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/).
- **Bevat** bij een onderzoeksgebied, vondstlocatie of terrein: hoeveel objecten erin liggen, per soort, met **Toon wat erin ligt** (`binnen=vondstlocatie:6129412`). Bij een onderzoeksgebied zijn dat alle niveaus: vondstlocaties, en via `isPartOf` ook de vondsten, grondsporen en complexen daarin. Dat is één extra request voor de hele pagina: een `filters`-aggregation met per object dezelfde clause als **Toon wat erin ligt**, zodat een object één keer telt.
- **In de buurt** (`binnen=rond:archeologischonderzoeksgebied:2041587:1000`): `geo_distance` vanaf het (zwaarte)punt, voor objecten met een geometrie.
- **Datering met jaartallen uit ABR** (`?van=-500&tot=500`, eventueel `&jaarmodus=binnen`). Beginjaar (`startDate`) en eindjaar (`endDate`) staan als getal in de index (`.getal`, uit de index template). Standaard telt een object mee als de datering er **(deels)** in valt (`startDate ≤ tot` en `endDate ≥ van`); met *helemaal* moet de hele datering erbinnen vallen. Brede dateringen (bijv. Prehistorie – Nieuwe Tijd, −1.000.000 tot 1945) vallen bijna altijd deels in een periode. Het filter staat in de query (net als *binnen*), dus facetten en totalen tellen mee.
- **Chronologisch sorteren**: *Periode (oud → jong)* sorteert op `startDate.getal`, dan `endDate.getal`.
- **ABR-hiërarchie als facet**: *Typegroep (ABR) of kenmerk* (`keywords`: de bovenliggende ABR-begrippen van het type; bij vondstlocaties en onderzoeksgebieden ook verwerving en AMK-indicatie) en *Materiaal (met groepen)* (bijv. ijzer → metaal → anorganisch). Filteren op "metaal" vindt ijzer, brons, koper enz.
- **ABR-begrip**: bij vondsten, grondsporen en complexen een link naar het ABR-concept van het type (`sameAs`).
- Facetten: soort, naam of type, typegroep, periode, materiaal, stijl en cultuur, waardering, provincie, plaats, toegang. Sorteren op relevantie (naam telt 3×), naam, plaats, periode (chronologisch), soort of nummer.

## Lokaal starten

Vereist Node.js 18 of nieuwer, zonder npm-dependencies.

```bash
npm start
```

Open daarna `http://127.0.0.1:4175`.

```bash
npm test
```

```bash
npm run test:live
```

`npm test` test queryopbouw, standaardfilter, datering, relaties, URL, uitleg en CSV zonder netwerk. `npm run test:live` test tegen de service: CORS, soortfacet = totaal, geen `#…`-documenten, de standaard zonder vondsten en grondsporen, binnen vondstlocatie 6129412, de inhoudtelling, in de buurt en sorteren op nummer. Andere service: `node tests/live.mjs <naam>`.

## Deployment

Een Cloudflare Worker die alleen de statische bestanden uit `web/` serveert (`wrangler.jsonc`, naam `elastic-archeologie`), online op <https://elastic-archeologie.jolietjakeblues64.workers.dev/>. De repository is gekoppeld via Workers Builds: elke push naar `main` wordt automatisch gepubliceerd, andere branches krijgen een preview-URL. Handmatig:

```bash
npx wrangler deploy
```

## Bestanden

| Bestand | Rol |
|---|---|
| `archeologie/*.rq` | CONSTRUCT-queries voor de dataset (leidende versie; kopieën in `elastic-erfgoed/triply/construct/archeologie/`) |
| `triply/elastic-service-archeologie.json` | Config van de Elasticsearch-service |
| `web/search.js` | Velden, soorten, standaardfilter, datering, queryopbouw (zoeken, context, facetten, relaties, erfgoed-sdo), URL, uitleg, CSV, service |
| `web/app.js` | Interface: resultaten met relaties, facetten, context, kaart, export |
| `web/geo.js` | WKT naar kaartcoördinaten (gelijk aan de erfgoeddemo) |
| `web/style.css` | RCE-huisstijl, kleuren per soort |
| `tests/search.test.mjs`, `tests/live.mjs` | Tests zonder en met netwerk |

## Bekende beperkingen

- Complexen, grondsporen en vondsten hebben geen locatie; vondstlocaties en terreinen alleen een geleend vlak. Dat vlak is het hele onderzoeksgebied of rijksmonument, niet de vindplek.
- Facetten tonen de 100 meest voorkomende waarden.
- Ongeveer 1.900 van de 360.390 complexen hebben twee namen: hun type heeft in ABR geen label of twee Nederlandse labels.
- Ca. 888.000 van de 1,14 miljoen objecten hebben jaartallen. Objecten zonder datering vallen weg zodra je op jaartal filtert, en staan achteraan bij chronologisch sorteren.
- In de brondata staan soms omgekeerde dateringen (beginperiode later dan eindperiode, bijv. "Midden Romeinse Tijd A - Laat Neolithicum") en een aantal van 9999 als onbekend. Die komen ongewijzigd in de demo.
- De kaart toont alleen de resultaten van de huidige pagina (25).
