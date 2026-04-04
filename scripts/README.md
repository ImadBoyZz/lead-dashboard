# KBO Data Importeren -- Stap voor Stap

## 1. Account aanmaken bij KBO Open Data

- Ga naar https://kbopub.economie.fgov.be/kbo-open-data/signup?form
- Vul je gegevens in (naam, email, organisatie: "Averis Solutions")
- Bevestig je account via email
- Log in op https://kbopub.economie.fgov.be/kbo-open-data/login

## 2. Data downloaden

- Klik op "Download" na inloggen
- Download het **Full** bestand (niet Update): `KboOpenData_XXXX_XXXX_XX_Full.zip`
- Bestandsgrootte: ~240 MB (zip), ~1.5 GB uitgepakt
- Pak het ZIP bestand uit in een map, bijv: `./kbo-data/`

## 3. Verwachte bestanden na uitpakken

```
kbo-data/
├── enterprise.csv    (~1.9M rijen - alle actieve ondernemingen)
├── denomination.csv  (~3.2M rijen - bedrijfsnamen)
├── address.csv       (~2.8M rijen - adressen)
├── contact.csv       (~650K rijen - telefoon, email, website)
├── activity.csv      (~20.5M rijen - NACE codes)
├── establishment.csv (~1.6M rijen - vestigingen)
├── code.csv          (code beschrijvingen)
├── branch.csv        (buitenlandse vestigingen)
└── meta.csv          (metadata)
```

## 4. Import script draaien

### Test eerst met 100 bedrijven:

```bash
npx tsx scripts/kbo-import.ts ./kbo-data --limit 100
```

### Dry run (toont wat er geimporteerd zou worden, zonder te versturen):

```bash
npx tsx scripts/kbo-import.ts ./kbo-data --limit 50 --dry-run
```

### Volledige import (~200K-300K Vlaamse bedrijven):

```bash
npx tsx scripts/kbo-import.ts ./kbo-data
```

Dit duurt ~15-30 minuten afhankelijk van je internetsnelheid.

### Importeren naar productie (Vercel):

```bash
API_URL=https://lead-dashboard-taupe.vercel.app npx tsx scripts/kbo-import.ts ./kbo-data
```

## 5. Na de import

- Open het dashboard en check of de bedrijven verschijnen
- De enrichment workflow in n8n zal automatisch websites scannen
- Of gebruik de "Scan website" knop op individuele leads

## Tips

- De import filtert automatisch op Vlaamse postcodes
- Bedrijven zonder naam of adres worden overgeslagen
- Duplicaten worden automatisch ge-upsert (geen dubbele entries)
- Je kunt de import veilig opnieuw draaien -- bestaande data wordt bijgewerkt

## Postcodes die worden meegenomen

| Regio | Postcodes | Provincie |
|-------|-----------|-----------|
| Brussel | 1000-1299 | Brussel |
| Vlaams-Brabant | 1500-1999, 3000-3499 | Vlaams-Brabant |
| Antwerpen | 2000-2999 | Antwerpen |
| Limburg | 3500-3999 | Limburg |
| West-Vlaanderen | 8000-8999 | West-Vlaanderen |
| Oost-Vlaanderen | 9000-9999 | Oost-Vlaanderen |
