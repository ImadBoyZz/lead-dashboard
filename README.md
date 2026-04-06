# Lead Dashboard — Averis Solutions

Een intern dashboard waarmee Averis Solutions automatisch potentiele klanten vindt in Vlaanderen en Nederland. Het systeem zoekt bedrijven die geen of een slechte website hebben en dus baat zouden hebben bij webdesign, AI of digitale diensten.

## Wat doet dit dashboard?

### Leads vinden
Je kiest een **sector** (bv. Auto, Horeca, Beauty) en een **stad** (bv. Aalst, Gent, Antwerpen). Het dashboard doorzoekt vervolgens Google Maps en haalt alle bedrijven op in die sector en regio — inclusief omliggende gemeenten (bv. als je Aalst kiest, worden ook Lede, Erpe-Mere, Haaltert meegenomen).

Je kan kiezen hoeveel leads je wilt ophalen: 20, 40, 60 of 100. De resultaten verschijnen in een popup waar je per bedrijf kan zien:
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

### Pipeline beheren
Gevonden leads doorlopen een **verkooppijplijn** met 5 fases:
1. **Nieuw** — Net geimporteerd, nog niet gecontacteerd
2. **Gecontacteerd** — Je hebt een bericht gestuurd of gebeld
3. **Meeting** — Er is een afspraak gepland
4. **Gewonnen** — De deal is binnen
5. **Genegeerd** — Niet interessant

Je kan leads verslepen tussen fases via een visueel bord (zoals Trello).

### Outreach bijhouden
Per lead kan je bijhouden:
- Welk kanaal je hebt gebruikt (e-mail, telefoon, LinkedIn, WhatsApp)
- Notities over het gesprek
- Herinneringen voor opvolging

### Website audit
Voor leads die wel een website hebben, kan het dashboard een **automatische audit** uitvoeren:
- Laadsnelheid (PageSpeed score)
- SSL-certificaat (beveiligde verbinding)
- Welk CMS ze gebruiken (WordPress, Wix, etc.)
- Of ze analytics/tracking hebben

Dit geeft je concrete argumenten in een verkoopgesprek: "Uw website scoort 35/100 op snelheid" is overtuigender dan "u heeft een slechte website".

### GDPR-compliant
Het dashboard respecteert privacyregels:
- Bedrijven kunnen een **opt-out** aanvragen (worden dan niet meer gecontacteerd)
- Er is een **blacklist** voor bedrijven die je permanent wilt uitsluiten
- Alle data komt van publieke bronnen (Google Maps)

## Overzicht van de pagina's

| Pagina | Wat je er doet |
|---|---|
| **Dashboard** | Overzicht met statistieken (totaal leads, nieuwe leads, score-verdeling) |
| **Cold Leads** | Leads zoeken, importeren, filteren en beheren |
| **Warm Leads** | Leads die al gecontacteerd zijn of interesse tonen |
| **Pipeline** | Visueel bord met alle leads per fase (sleep ze tussen kolommen) |
| **Logs** | Geschiedenis van alle imports |
| **Herinneringen** | Overzicht van geplande opvolgingen |
| **Instellingen** | GDPR opt-out en blacklist beheer |

## Technische info

Gebouwd met Next.js, TypeScript en Tailwind CSS. Data wordt opgeslagen in een PostgreSQL database (Neon). Leads worden gevonden via de Google Places API. Gehost op Vercel.
