# AntikFinder 🏛️

Eine schlanke, kostenlose Web-App zum Entdecken von antiken Ruinen, archäologischen Stätten („Antik Kent“) und historischen Bauwerken in deiner Umgebung – inklusive Kurzbeschreibung und 1-Klick-Routenplanung in Google Maps.

## Funktionen
- **Aktueller Standort (GPS)** oder **Klick auf einen beliebigen Punkt** der Karte
- **Ortssuche** (z. B. Antalya, Side, Athen, Rom, Trier)
- **Einstellbarer Suchradius** (10, 25, 50 oder 80 km)
- **Karten-, Satelliten- & OpenStreetMap-Ansicht**
- **Deutsche Kurzbeschreibung & Fotos** automatisch aus Wikidata / Wikipedia
- **1-Klick-Navigation** direkt in die Google-Maps-App
- **100 % kostenlos, ohne API-Keys und ohne Backend** (statisches Hosting über GitHub Pages)
- **Optional: Google Maps Karte per lokalem API-Key** – über das Zahnrad-Symbol lässt sich ein eigener Google Maps API-Key ausschließlich lokal im Browser (`localStorage`) speichern (kein Key im Repository; ohne Key läuft automatisch OpenStreetMap)

## Optional: Google Maps nutzen
1. In der App oben rechts auf das **Zahnrad-Symbol** tippen.
2. Deinen eigenen **Google Maps API-Key** eingeben (wird nur lokal auf deinem Gerät gespeichert).
3. In der Google Cloud Console sollte die **Maps JavaScript API** (und optional die **Geocoding API**) aktiviert sein. Empfohlen: Key dort per **HTTP-Referrer** auf deine Domain und per **Tageslimit (Quota)** absichern.

