# Lead Dashboard — Averis Solutions

Een intern dashboard waarmee Averis Solutions automatisch potentiele klanten vindt in Vlaanderen. Het systeem zoekt bedrijven die geen of een slechte website hebben en dus baat zouden hebben bij webdesign, AI of digitale diensten.

## Wat doet dit dashboard?

### Leads vinden
Je kiest een **sector** (bv. Auto, Horeca, Beauty) en een **stad** (bv. Aalst, Gent, Antwerpen). Het dashboard doorzoekt vervolgens Google Maps en haalt alle bedrijven op in die sector en regio — inclusief omliggende gemeenten.

Je kan kiezen hoeveel leads je wilt ophalen: 20, 40, 60 of 100. Per bedrijf zie je:
- Naam en adres
- Google-beoordeling en aantal reviews
- Of ze al een website hebben
- Een kwaliteitsscore (hoe hoger, hoe interessanter als klant)
- Waarschuwingen als het een keten/franchise is (bv. Carglass, Midas)

Je selecteert welke leads je wilt bewaren en importeert ze met een klik.

### Leads scoren
Elk bedrijf krijgt automatisch een **score van 0 tot 100**. Hoe hoger de score, hoe groter de kans dat dit bedrijf een goede klant is. De score is gebaseerd op:
- **Geen website?** Dat is juist goed — het betekent dat ze jouw diensten nodig hebben
- **Veel Google reviews?** Dan is het een actief, bewezen bedrijf met budget
- **Bereikbaar?** Telefoon of e-mail beschikbaar
- **Sector?** Sommige sectoren (horeca, beauty, auto) hebben meer nood aan online zichtbaarheid

Bedrijven worden ook ingedeeld in **kwaliteitsklassen** (A t/m D):
- **A — Bewezen lokale speler**: Actief bedrijf, zichtbare sector, geen/slechte website
- **B — Groeiende onderneming**: Professionele sector, verouderde online aanwezigheid
- **C — Ambitieuze starter**: Jong bedrijf met groeipotentieel
- **D — Lage prioriteit**: IT-bedrijven, freelancers of inactieve bedrijven

### Warm Leads
Leads die goed scoren en in een interessante sector zitten worden automatisch als **warm** gemarkeerd. Op de Warm Leads-pagina kan je:
- Filteren op sector, provincie en of ze al een website hebben
- Meerdere leads tegelijk selecteren met checkboxes
- In bulk hun websites laten scannen
- In bulk AI-berichten laten genereren (zie hieronder)

### AI-berichten genereren
Het dashboard kan automatisch **e-mails en belscripts schrijven** voor elke lead. De AI (Claude of GPT-4o) analyseert:
- Het bedrijf (sector, stad, Google reviews)
- De website-audit (PageSpeed score, SSL, CMS)
- De kwaliteitsscore en zwakke punten
- Eerdere berichten die je al gestuurd hebt

Je krijgt **2 varianten** met verschillende toon (formeel vs. informeel) en kiest welke je wilt gebruiken. De toon past zich automatisch aan: een advocatenkantoor krijgt een formele mail, een kapper een vlotte.

### Batch campagnes
Je kan meerdere warm leads tegelijk selecteren en in een keer berichten laten genereren. Dit maakt een **campagne** aan:
1. De AI schrijft voor elke lead een concept-mail
2. Je komt op een goedkeuringspagina waar je elk bericht kan:
   - **Goedkeuren** — klaar om te versturen
   - **Afwijzen** — wordt niet verstuurd
   - **Opnieuw genereren** — AI schrijft een nieuw bericht
3. Met een klik verstuur je alle goedgekeurde berichten via Gmail
4. Er wordt automatisch een herinnering aangemaakt om op te volgen

### Gmail integratie
Het dashboard is gekoppeld aan Gmail. Je kan:
- Mails **versturen** vanuit het dashboard (geen copy-paste meer)
- Zien of een lead **geantwoord** heeft (thread tracking)
- De volledige **e-mailconversatie** bekijken per lead

### AI opvolgingsuggesties
Na een outreach-poging kan de AI een **opvolgingsuggestie** geven:
- Welk kanaal je het best kan gebruiken (e-mail, telefoon, etc.)
- Hoelang je moet wachten
- Een voorgesteld bericht
- De redenering erachter

Als je de suggestie accepteert, wordt automatisch een herinnering aangemaakt.

### AI inzichten
Het dashboard analyseert je outreach-resultaten en geeft **inzichten**:
- Welke sectoren het best reageren
- Welke kanalen het meest opleveren
- Waar je je strategie kan bijsturen

### Pipeline beheren
Gevonden leads doorlopen een **verkooppijplijn** met 5 fases:
1. **Nieuw** — Net geimporteerd, nog niet gecontacteerd
2. **Gecontacteerd** — Je hebt een bericht gestuurd of gebeld
3. **Meeting** — Er is een afspraak gepland
4. **Gewonnen** — De deal is binnen
5. **Genegeerd** — Niet interessant

Je kan leads verslepen tussen fases via een visueel **kanban-bord** (zoals Trello). Het dashboard houdt ook bij: dealwaarde, verwachte sluitdatum, aantal outreach-pogingen en reden bij verlies.

### Outreach bijhouden
Per lead kan je bijhouden:
- Welk kanaal je hebt gebruikt (e-mail, telefoon, LinkedIn, WhatsApp, persoonlijk)
- Het verstuurde bericht en onderwerp
- Het resultaat (geen antwoord, interesse, meeting geboekt, etc.)
- Of het bericht door AI is geschreven
- De volledige e-mailthread als het via Gmail is verstuurd

### Herinneringen
Het dashboard heeft een **herinneringensysteem**:
- Maak handmatig herinneringen aan (opvolgen, bellen, meeting voorbereiden)
- Na een batch campagne worden automatisch herinneringen aangemaakt
- Overzicht van alle openstaande en verlopen herinneringen
- Markeer als afgehandeld of overgeslagen

### Website audit
Voor leads die wel een website hebben, kan het dashboard een **automatische audit** uitvoeren:
- Laadsnelheid (PageSpeed score mobiel en desktop)
- SSL-certificaat (beveiligde verbinding)
- Welk CMS ze gebruiken (WordPress, Wix, etc.)
- Of ze analytics/tracking hebben (Google Analytics, Tag Manager, Facebook Pixel)
- Of de site mobielvriendelijk is
- SEO-checks (meta description, Open Graph, structured data)
- Cookie banner aanwezig

Dit geeft je concrete argumenten in een verkoopgesprek: "Uw website scoort 35/100 op snelheid" is overtuigender dan "u heeft een slechte website".

### Outreach templates
Je kan **herbruikbare templates** opslaan voor e-mails en belscripts. De AI kan deze templates als basis gebruiken bij het genereren van berichten.

### CSV export
Exporteer je leads als **CSV-bestand** met alle filters toegepast. Handig voor rapportages of om data te delen.

### GDPR-compliant
Het dashboard respecteert privacyregels:
- Er is een **blacklist** voor bedrijven die je permanent wilt uitsluiten
- Leads kunnen een **opt-out** krijgen
- Alle data komt van publieke bronnen (Google Maps)

## Overzicht van de pagina's

| Pagina | Wat je er doet |
|---|---|
| **Dashboard** | Overzicht met statistieken (totaal leads, nieuwe leads, score-verdeling) |
| **Cold Leads** | Leads zoeken, importeren, filteren en beheren |
| **Warm Leads** | Leads met hoog potentieel — batch selectie, scan en outreach |
| **Pipeline** | Visueel kanban-bord met alle leads per fase (sleep ze tussen kolommen) |
| **Logs** | Geschiedenis van alle imports en notities per bedrijf |
| **Herinneringen** | Overzicht van geplande opvolgingen |
| **Instellingen** | GDPR opt-out en blacklist beheer |

## Technische info

Gebouwd met Next.js, TypeScript en Tailwind CSS. Data wordt opgeslagen in een PostgreSQL database (Neon). Leads worden gevonden via de Google Places API. AI-berichten via Claude (Anthropic) of GPT-4o (OpenAI). E-mails via Gmail API. Gehost op Vercel.
