# Temperature Overview Card (FR)

Carte Home Assistant « **suivi des températures** » : zones (nuit, jour, technique…) avec, pour chaque capteur, la valeur colorée selon le confort, les min/max et une courbe d'historique. **Responsive** : une colonne en portrait sur smartphone, plusieurs colonnes en paysage sur tablette (jusqu'à 5 zones côte à côte). Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
HACS → ⋮ → Dépôts personnalisés → URL de ce dépôt, catégorie **Tableau de bord** → installer → recharger la page.

> Astuce : placez la carte dans une vue de type **Panneau** (une seule carte) pour qu'elle occupe toute la largeur de l'écran.

## Configuration
```yaml
type: custom:temperature-overview-card
title: 🌡️ Suivi des Températures
comfort_min: 19      # en dessous : bleu
comfort_max: 23      # au-dessus : orange
zones:
  - title: 🛏️ Zone Nuit
    sensors:
      - { entity: sensor.temperature_suite_temperature, name: Suite }
      - { entity: sensor.temperature_logan_temperature, name: Logan }
  - title: 🔧 Zone Technique
    color: false       # pas de coloration confort (ex. eau chaude à 57 °C)
    sensors:
      - { entity: sensor.esp_routeur_esp_routeur_temp_haut_ecs, name: T°Haute Eau chaude }
  - title: Autres
    color: false
    sensors:
      - entity: sensor.congelateur_temperature
        name: Congélateur
        min: -20           # affiche une jauge
        max: -8
        severity: { yellow: -12, red: -10 }
```

| Option | Description |
|---|---|
| `zones[]` | `title`, `color` (colorer selon le confort, vrai par défaut), `sensors[]` |
| `sensors[]` | `entity`, `name`, `color` (remplace celui de la zone), `min` + `max` (jauge), `severity` (`yellow`, `red` : seuils d'alerte quand la valeur monte) |
| `comfort_min`, `comfort_max` | Bleu en dessous, vert entre, orange au-dessus |
| `hours_to_show` | Historique des courbes et du min/max (24 h par défaut) |
| `show_graph`, `show_minmax` | Afficher les courbes / les min–max |
| `columns` | Zones par ligne (0 = automatique selon la largeur) |
| `theme` | `auto`, `light`, `dark` |

Toucher un capteur ouvre son historique. Licence MIT.
