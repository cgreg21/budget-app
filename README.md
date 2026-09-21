# Budget App

An [Adwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/) application built
with [node-gtk](https://github.com/romgrk/node-gtk) and TypeScript.

## Prerequisites

You need GTK 4 and libadwaita — plus their GObject-Introspection data — installed
on your system. node-gtk talks to the libraries you actually have installed.

- **Fedora:** `sudo dnf install gtk4-devel libadwaita-devel gobject-introspection-devel`
- **Debian/Ubuntu:** `sudo apt install libgtk-4-dev libadwaita-1-dev gobject-introspection`
- **Arch:** `sudo pacman -S gtk4 libadwaita gobject-introspection`
- **macOS (Homebrew):** `brew install gtk4 libadwaita gobject-introspection`

The `-dev`/`-devel` packages also ship the `.gir` files used to embed GNOME's API
documentation into the generated TypeScript types (shown on hover in your editor).

You also need **Node.js ≥ 20.6** (for the `gi:` import hooks).

## Getting started

```sh
npm install        # installs deps and generates TypeScript types (postinstall)
npm run dev        # run the app with live reload
```

That's it — a window should appear. Edit `style.css` while it runs and the
window restyles instantly, no restart. To also restart the app when you edit
`src/`, run `npm run dev:app-reload` instead (it adds `node --watch`).

## Flatpak Linux

The project includes a Flatpak target under `flatpak/`. Install Flatpak and
`flatpak-builder`, then run:

```sh
npm install
npm run flatpak:build
npm run flatpak:run
```

To create a distributable file after building:

```sh
npm run flatpak:bundle
```

This creates `budget-app.flatpak`. The manifest builds the TypeScript app and
its native `node-gtk` dependency inside the GNOME 48 SDK, and includes the
bundled SVG assets. The build currently targets Linux x86_64 because it embeds
the matching Node.js runtime; an ARM64 manifest needs a separate Node.js
archive.

## AppImage Linux

To build a portable AppImage, install `curl` and `tar`, then run:

```sh
npm install
npm run appimage:build
```

The script downloads the matching Node.js and `linuxdeploy` binaries, builds
the application, embeds the runtime, `node-gtk`, assets and stylesheet, then
creates `Budget_App-x86_64.AppImage` (or the matching ARM64 filename) at the
project root. The GTK 4 and libadwaita libraries remain provided by the host
system, as is customary for GTK applications.

## Windows

Build the portable Windows x64 bundle from PowerShell on Windows:

```powershell
npm install
npm run windows:build
```

This creates `Budget-App-windows-x64.zip` with a Node.js runtime, the compiled
application, native dependencies and a `Budget App.cmd` launcher. GTK 4 and
libadwaita must be installed on the Windows machine.

## macOS Apple Silicon

Build the arm64 `.app` bundle on an Apple Silicon Mac:

```sh
npm install
npm run macos:arm:build
```

This creates `Budget-App-macos-arm64.zip`. GTK 4 and libadwaita are expected
from Homebrew on the target Mac.

## How it works

Namespaces are imported with the `gi:` scheme, and their default export is the
namespace object:

```ts
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'
```

For those imports to resolve, node-gtk's loader hooks must be installed, which is
why the app is run with `node --import node-gtk/register`. The `dev`/`start`
scripts already include this (along with `tsx`, which runs the TypeScript without
a separate build step). node-gtk integrates the GTK main loop with Node's event
loop automatically.

## Scripts

| command                  | what it does                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev`            | Run with live CSS reload — edit `style.css`, the window restyles, no restart. |
| `npm run dev:app-reload` | Like `dev`, but also restarts the app when you edit `src/` (`node --watch`). |
| `npm start`              | Run once without building.                                        |
| `npm run build`     | Type-check and compile `src/` to `dist/` with `tsc`.             |
| `npm run typecheck` | Type-check only, no output.                                      |
| `npm test`               | Run the unit test suite once (Vitest).                       |
| `npm run test:watch`     | Re-run the affected tests as you edit.                       |
| `npm run test:coverage`  | Run the suite and report coverage for `src/`.                |
| `npm run generate-types` | (Re)generate TypeScript types for the GI namespaces you use. |

## TypeScript types

Types are generated **on your machine** from the GObject-Introspection typelibs
you have installed, so they match your actual library versions and node-gtk's
runtime shape (camelCase methods, typed signals, nullability, …). They live in
`node_modules/.node-gtk-types/` (git-ignored) and `tsconfig.json` points at them.

The `postinstall` script regenerates them automatically. If you start using
another library, add it to the `generate-types` script in `package.json` and
re-run it:

```jsonc
// package.json
"generate-types": "node-gtk generate-types Gtk-4.0 Adw-1 GtkSource-5"
```

```sh
npm run generate-types
```

## Project structure

The code is organised in layers, from the model outwards to the toolkit:

```
.
├── src/
│   ├── main.ts                       # bootstrap — loads the stylesheet, starts the app
│   ├── domain/                       # the model and its rules (no GTK, no I/O)
│   │   ├── transaction.ts            #   Transaction, Totals, validation, sorting, aggregation
│   │   ├── month.ts                  #   month keys ("2026-09"), arithmetic, bounds, ordering
│   │   ├── balance.ts                #   thresholds (x < y < z) and balance bands
│   │   ├── recurrence.ts             #   recurring templates and the occurrences they owe
│   │   ├── backup.ts                 #   the backup archive: shape, checks, merge
│   │   ├── csv.ts                    #   transactions as a spreadsheet sees them
│   │   ├── remote.ts                 #   the rules of the remote storage (paths, status, read-only)
│   │   └── category.ts               #   categories (name + icon) and their rules
│   ├── data/                         # persistence
│   │   ├── paths.ts                  #   where the JSON files live
│   │   ├── id.ts                     #   identifiers shared by the stores
│   │   ├── json-file-store.ts        #   observable store: load / commit / watch / dispose
│   │   ├── month-store.ts            #   one month = one file (months/YYYY-MM.json)
│   │   ├── budget-store.ts           #   the month history: selection, routing, recurrences
│   │   ├── legacy-migration.ts       #   splits an old transactions.json by month
│   │   ├── thresholds-store.ts       #   thresholds.json
│   │   ├── recurrence-store.ts       #   recurrences.json
│   │   ├── backup-service.ts         #   import / export, JSON archive and CSV
│   │   ├── category-store.ts         #   categories.json
│   │   └── remote/                   #   the cloud: server as reference, files as cache
│   │       ├── provider.ts           #     the provider seam (one per protocol)
│   │       ├── webdav-provider.ts    #     WebDAV / Nextcloud over fetch
│   │       ├── credentials.ts        #     the password: system keyring, then environment
│   │       ├── gateway.ts            #     what the stores call before writing
│   │       ├── remote-config-store.ts#     remote.json (local only)
│   │       └── remote-storage.ts     #     connect, fill the cache, mirror every write
│   ├── ui/                           # everything GTK
│   │   ├── gtk-types.ts              #   GTK/Adw instance-type aliases
│   │   ├── types.ts                  #   Component / Notify contracts
│   │   ├── format.ts                 #   currency, date, month and percent formatting
│   │   ├── widgets.ts                #   small widget builders shared by views
│   │   ├── icons.ts                  #   the palette of icons offered to categories
│   │   ├── cairo.ts                  #   hand-written typing for the Cairo context
│   │   ├── write-guard.ts            #   turns a refused write into a toast
│   │   ├── views/
│   │   │   ├── budget-view.ts        #     window content, wired to the store
│   │   │   ├── month-switcher.ts     #     ‹ Septembre 2026 › navigator + month picker
│   │   │   ├── summary-cards.ts      #     balance (colour-banded) / income / expenses
│   │   │   ├── category-charts.ts    #     pie charts by category, in the side column
│   │   │   ├── transaction-list.ts   #     list + empty state
│   │   │   ├── transaction-filters.ts #    search field, kind + categories, reset
│   │   │   ├── list-total.ts        #     count and total of the shown rows
│   │   │   └── transaction-row.ts    #     a single row
│   │   └── dialogs/
│   │       ├── form-dialog.ts        #     shell shared by the "new / edit" forms
│   │       ├── category-combo.ts     #     the "Catégorie" row, icons included
│   │       ├── icon-picker-dialog.ts #     the icon grid for a category
│   │       ├── transaction-dialog.ts #     add / edit a transaction, repetition included
│   │       ├── edit-scope-dialog.ts  #     "cette occurrence ou toute la série ?"
│   │       ├── confirm-delete-dialog.ts # "supprimer « … » ?", before every deletion
│   │       ├── recurrence-dialog.ts  #     add / edit a recurrence
│   │       ├── occurrence-count-field.ts # optional "how many times?" field
│   │       ├── options-dialog.ts     #     the options window: one tab per section
│   │       ├── thresholds-group.ts   #     "Seuils" tab: x / y / z settings
│   │       ├── recurrences-group.ts  #     "Récurrences" tab: recurring transactions
│   │       ├── categories-group.ts   #     "Catégories" tab: category management
│   │       ├── data-group.ts         #     "Données" tab: import / export
│   │       ├── cloud-group.ts        #     "Cloud" tab: the remote server and its status
│   │       ├── file-dialogs.ts       #     choosing a file to read or write
│   │       ├── import-mode-dialog.ts #     "remplacer ou fusionner ?"
│   │       └── about-dialog.ts
│   └── app/                          # composition root
│       ├── app-info.ts               #   id, name, version
│       ├── main-window.ts            #   window + header bar
│       └── application.ts            #   lifecycle, actions, shutdown
├── test/                             # Vitest suites, mirroring src/
│   ├── helpers/                      #   a throwaway data dir, GLib and libsecret stubs
│   ├── domain/                       #   the rules, tested in isolation
│   ├── data/                         #   the stores, against real files in a temp dir
│   └── ui/                           #   the pure helpers (formatting, icons, write guard)
├── style.css          # custom CSS (hot-reloads live under `npm run dev`)
├── vitest.config.ts   # test setup: GI aliases, coverage thresholds
├── tsconfig.json
└── package.json
```

Dependencies only point downwards: `app` → `ui` → `data` → `domain`. The domain
layer is plain TypeScript, so its rules can be read (and reused) without GTK.

## Gestion de budget personnel

Cette application permet de suivre revenus et dépenses, **mois par mois** :

- Navigation entre les mois via la barre d'en-tête : flèches ‹ › d'un mois à l'autre, et menu déroulant proposant un sélecteur d'année ‹ 2026 › avec la grille des douze mois. **N'importe quel mois, passé ou futur, peut être affiché**, qu'il contienne des données ou non ; un point signale ceux qui en contiennent et un raccourci ramène au mois courant.
- **Tout mois chargé est modifiable** : ajout, modification (clic sur une ligne ou icône crayon) et suppression s'appliquent au mois affiché.
- **Toute suppression demande confirmation** : transaction, récurrence ou catégorie, le bouton corbeille ouvre d'abord une alerte nommant l'élément visé et rappelant ce que l'opération emporte — et ce qu'elle épargne. Le bouton *Supprimer* y est marqué comme destructeur et n'est jamais la réponse par défaut : Entrée ou Échap annulent.
- Ajout d'une transaction (revenu ou dépense) via le bouton **+**, avec description, montant, catégorie, type **et répétition** (Ponctuelle, Mensuelle, Trimestrielle, Annuelle). Elle est datée du jour si le mois courant est affiché, sinon du 1er du mois affiché — elle se range donc toujours dans le mois consulté.
- Résumé du mois affiché : solde, total des revenus, total des dépenses.
- **Barre de filtres au-dessus de la liste** : un champ de recherche (sur la description **et** la catégorie, insensible à la casse **et aux accents** — `electricite` trouve « Électricité »), un menu **Tous / Revenus / Dépenses**, un menu **de catégories à choix multiple** (cases à cocher ; son libellé indique « Toutes », la catégorie retenue, ou « 3 catégories »), et un bouton croix qui remet le tout à zéro (actif seulement quand un filtre l'est). Le filtre ne change que ce qui est affiché : résumé et graphiques continuent de décrire le mois entier, et il reste en place d'un mois à l'autre pour suivre une dépense dans le temps. Si plus rien ne correspond, la liste l'annonce au lieu de paraître vide. Renommer ou supprimer une catégorie cochée décoche simplement celle-ci.
- **Sous la liste, un total de ce qui est affiché** : le nombre de lignes (« 12 transactions sur 34 » dès qu'un filtre est posé) et leur montant, vert ou rouge selon le signe. C'est un **solde**, pas une somme : une liste mêlant revenus et dépenses additionnerait sinon un salaire à un loyer. Filtrée sur un seul type, elle se lit donc comme le total de ce type.
- **Chaque ligne de la liste porte une bordure de couleur à gauche** : verte pour un revenu, rouge pour une dépense. Le montant suit la même règle, et l'icône de catégorie apparaît **en blanc sur une pastille ronde de cette couleur**.
- **Le solde prend une couleur de fond selon son montant** : rouge en dessous de `x`, orange de `x` à `y`, jaune de `y` à `z`, vert à partir de `z`.
- Graphiques en camembert des dépenses et des revenus par catégorie, pour le mois affiché, présentés dans une **colonne à droite de la liste des transactions** : elle occupe un quart de la largeur de la fenêtre, et les deux camemberts s'y partagent la hauteur à parts égales.
- **Transactions récurrentes** (loyer, salaire, abonnement…) : fréquence **mensuelle, trimestrielle ou annuelle**, jour du mois et mois de départ. Chaque occurrence est créée automatiquement **à l'ouverture du mois concerné** et posée sur un **fond plus sombre** dans la liste ; **la survoler affiche un panneau** rappelant la série dont elle vient — fréquence, jour, période et date de l'occurrence. Le jour est ramené au dernier jour des mois plus courts (un 31 devient le 28 en février). Supprimer une occurrence la fait réapparaître à la prochaine ouverture du mois ; supprimer la récurrence ne touche pas aux transactions déjà créées.
- La répétition se règle **directement depuis la transaction** : choisir une fréquence lors de l'ajout crée la série (même jour, à partir de ce mois-ci) ; la choisir en modification transforme la transaction en première occurrence ; revenir à « Ponctuelle » arrête la série.
- Une série est **illimitée par défaut**, mais peut recevoir une **durée** : activer « Durée limitée » puis indiquer un **nombre d'occurrences** (1 à 600, par exemple 12 fois). La série s'arrête alors d'elle-même ; l'onglet Récurrences affiche la période complète (« Janvier 2033 → Décembre 2033 (12 fois) »). Le nombre reste modifiable à tout moment, pour allonger, raccourcir ou revenir à l'illimité.
- À l'enregistrement d'une transaction récurrente, l'application **demande la portée** : *cette occurrence* (la récurrence reste inchangée) ou *toute la série* (le modèle suit, les mois à venir aussi). Un changement de fréquence ne peut porter que sur la série ; le jour et le mois de départ de la série sont préservés.
- **Chaque catégorie porte une icône**, choisie dans un sélecteur de 40 icônes (maison, panier, voiture, santé, loisirs…) ouvert depuis le bouton d'icône de l'onglet Catégories. Elle apparaît partout : devant chaque ligne de transaction, dans le menu déroulant « Catégorie » des formulaires et dans la liste des options. Renommer une catégorie conserve son icône, et changer l'icône ne touche à aucune transaction.
- Options (menu principal ☰, première entrée), en cinq onglets : **Seuils** (réglage de `x`, `y` et `z`, positifs ou négatifs, enregistrés uniquement si `x < y < z`), **Récurrences** (ajout, modification, suppression), **Catégories** (ajout, renommage, choix d'icône, suppression), **Données** (import / export) et **Cloud** (serveur WebDAV — voir *Stockage distant*).
- **Import / export**, depuis l'onglet Données :
  - **Sauvegarde complète** dans un fichier `.json` : catégories, seuils, récurrences et tous les mois de l'historique. À la relecture, l'application demande quoi en faire — **Fusionner** (les données actuelles sont conservées, seul ce qui manque est ajouté) ou **Remplacer** (le fichier devient la référence ; les mois qu'il ne contient pas sont supprimés). La fusion repère les doublons par leur contenu autant que par leur identifiant : réimporter deux fois la même sauvegarde n'ajoute rien la seconde fois.
  - **Export CSV** des transactions de tous les mois (`date;description;catégorie;type;montant`, décimales à la virgule, BOM UTF-8) : le fichier s'ouvre directement dans Excel ou LibreOffice.
  - **Import CSV** : chaque ligne rejoint le mois de sa date et **s'ajoute** aux transactions existantes. La lecture est tolérante — séparateur `;`, `,` ou tabulation, en-tête facultatif, dates `2026-09-17` ou `17/09/2026`, montants du genre `1 234,56 €`, type déduit du signe s'il manque — et les catégories inconnues sont créées. Les lignes illisibles sont comptées et ignorées.

### Stockage

Les données sont écrites en JSON sous le répertoire de données utilisateur
(`%LOCALAPPDATA%\budget-app\` sous Windows, `~/.local/share/budget-app/` sous Linux) :

```
budget-app/
├── categories.json     # la liste des catégories : nom + icône
├── thresholds.json     # les seuils x / y / z du solde
├── recurrences.json    # les transactions récurrentes
├── remote.json         # le serveur distant, s'il y en a un — jamais synchronisé
└── months/
    ├── 2026-08.json    # un fichier par mois — l'historique
    └── 2026-09.json
```

Chaque fichier est surveillé : s'il est modifié en dehors de l'application (autre
instance, outil de synchronisation, édition manuelle), l'interface se recharge
automatiquement. L'apparition d'un nouveau fichier de mois est détectée de la
même façon.

Consulter un mois ne crée rien : le fichier d'un mois n'apparaît qu'à sa première
transaction — ou dès sa consultation si une récurrence y est due, puisque
l'occurrence y est alors écrite.

Un ancien `transactions.json` (format mono-fichier) est réparti automatiquement
par mois au démarrage, puis renommé en `transactions.json.migrated` — rien n'est
supprimé.

Un `categories.json` écrit par une version antérieure (simple liste de noms,
`["Alimentation", …]`) est relu sans erreur : les icônes sont rétablies en
mémoire et le fichier n'est réécrit au nouveau format `{ "name", "icon" }` qu'à
la première modification d'une catégorie.

Ces fichiers restent le seul état de l'application : une sauvegarde exportée
depuis l'onglet **Données** n'est que leur réunion dans un document unique,
marqué `"format": "budget-app-backup"` et `"version"`, ce qui permet de refuser
proprement un fichier qui n'en est pas une. Restaurer une sauvegarde les
réécrit d'un bloc, puis l'interface se recharge sans qu'il soit nécessaire de
redémarrer.

### Stockage distant

Le budget peut vivre sur un serveur plutôt que sur une seule machine. L'onglet
**Cloud** des options demande une adresse WebDAV, un utilisateur, un mot de
passe et un dossier ; « Connecter » enregistre le tout et tente aussitôt la
connexion en disant ce qui s'est passé. Nextcloud, ownCloud et tout serveur
WebDAV conviennent.

**Le serveur est le budget ; les fichiers locaux n'en sont que le cache.** Cette
règle unique remplace tout ce qu'un outil de synchronisation contient
d'habitude : il n'y a ni file d'attente de modifications, ni résolution de
conflits, ni arbitrage entre deux versions. Les données ne circulent que dans
deux situations — le cache est rempli depuis le serveur à la connexion, et
chaque écriture est répercutée vers le serveur dans la foulée.

Il n'y a pas de troisième situation, parce qu'**il n'y a pas de modification
hors ligne** : dès que le serveur cesse de répondre, le budget passe en lecture
seule. Une bannière l'annonce en haut de la fenêtre, le bouton **+** est
désactivé, et toute tentative de modification répond par un message plutôt que
de s'appliquer. Le cache ne peut donc jamais s'écarter de la référence. Une
tentative de reconnexion a lieu chaque minute ; le bouton « Synchroniser » de
l'onglet Cloud la déclenche immédiatement.

Le dossier distant reproduit le dossier local, à l'exception près de
`remote.json` (qui doit rester modifiable même serveur injoignable, sans quoi
une adresse mal saisie enfermerait l'application hors de ses propres réglages) :

```
<dossier distant>/
├── categories.json
├── thresholds.json
├── recurrences.json
└── months/
    └── 2026-09.json
```

À la **première connexion**, un dossier distant vide est compris comme « ce
compte n'a pas encore de budget » : le budget local y est déposé tel quel. Dans
tous les autres cas c'est le serveur qui l'emporte, y compris pour l'absence
d'un mois — un mois supprimé ailleurs est supprimé ici. Un fichier de réglages
que le serveur ne connaît pas encore est en revanche envoyé plutôt qu'effacé :
une liste de catégories ajoutée sur cette machine est une donnée, pas un écart.

Le **mot de passe n'est écrit nulle part dans les fichiers du budget** : il est
confié au trousseau du système via libsecret. Le champ n'est jamais re-rempli —
il se remplace, il ne se relit pas. Là où libsecret est absent (Windows,
conteneur minimal, session sans trousseau), le mot de passe est lu dans
l'environnement, au choix `BUDGET_APP_REMOTE_PASSWORD` ou
`BUDGET_APP_WEBDAV_PASSWORD` :

```sh
BUDGET_APP_REMOTE_PASSWORD='…' npm start
```

« Oublier » déconnecte le serveur, efface le mot de passe du trousseau et
conserve l'adresse pour la fois suivante ; le budget redevient purement local
et le cache en place fait office de budget.

## Tests

La logique — le domaine, les stores, les rares fonctions pures de l'interface —
est couverte par [Vitest](https://vitest.dev/), sans GTK :

```sh
npm test               # la suite complète
npm run test:coverage  # la même, avec le rapport de couverture
```

Les suites vivent dans `test/`, en miroir de `src/`. Les stores sont testés
contre de vrais fichiers, dans un répertoire temporaire créé pour chaque fichier
de test ; les deux bibliothèques GI dont la couche données dépend (`GLib` pour
le chemin des données, `Secret` pour le trousseau) sont remplacées par des stubs
déclarés dans `vitest.config.ts`. Le code des widgets en est exclu : il demande
un vrai runtime GTK, et la logique sur laquelle il s'appuie est ailleurs.


## Learn more

- [node-gtk](https://github.com/romgrk/node-gtk) — the bindings
- [Importing libraries](https://github.com/romgrk/node-gtk/blob/master/doc/importing.md) — the `gi:` scheme and ESM details
- [GTK 4 API reference](https://docs.gtk.org/gtk4/)
- [libadwaita API reference](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/)
- [Adwaita style classes](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/style-classes.html)
