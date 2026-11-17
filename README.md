# TransConnect

Marketplace d’espace de transport entre la Tunisie et l’Europe — UI mobile (React + Vite), **6 langues**, **mode clair/sombre**, et un **backend Express + SQLite avec RBAC**.

## Démarrage

```bash
# 1) API (port 4000) — Node ≥ 20
cd backend && cp .env.example .env && npm install && npm run dev

# 2) Front (port 3000, proxy /api → 4000)
cd ../frontend && npm install && npm run dev
```

En dev (`SEED_DEMO=true`, par défaut hors production) l’API crée au premier lancement :

| Compte | Rôle | E-mail | Mot de passe |
|---|---|---|---|
| Admin | `admin` | `admin@transconnect.local` | `Admin#12345` |
| Client | `customer` | `client@demo.tc` | `Demo#12345` |
| Transporteurs | `carrier` | `fleet@demo.tc`, `marsa@demo.tc`, `knights@demo.tc`, `safe@demo.tc`, `med@demo.tc` | `Demo#12345` |

⚠️ Ces comptes sont **uniquement pour le développement**. En production : `NODE_ENV=production`, `JWT_SECRET` (≥ 32 car.), `ADMIN_EMAIL` / `ADMIN_PASSWORD`, `CORS_ORIGIN`, `SEED_DEMO=false`.

## Langues et thème

- `ar` (RTL), `en`, `fr`, `de`, `it`, `cs` — dictionnaires dans `src/i18n/*.ts`. `en.ts` est la référence : TypeScript refuse de compiler si une clé manque dans une autre langue.
- Pour ajouter une langue : créer `xx.ts` (`export const xx: Dict = {…}`), l’ajouter dans `LANGUAGES` et `dictionaries` (`src/i18n/index.tsx`).
- Thème : clair / sombre / auto (suit le système). Variables CSS dans `src/styles.css` (`:root` et `:root[data-theme=dark]`).
- Langue et thème sont mémorisés localement et, si l’utilisateur est connecté, sur son compte.

## Fonctionnalités avancées

- **Colis de 1 à 60 kg** : règle appliquée partout (recherche, détail, réservation, publication) **et** par le serveur (`WEIGHT_OUT_OF_RANGE`). Raccourcis de poids (1, 5, 10, 20, 30, 45, 60 kg) dans la réservation.
- **Suivi GPS sur une vraie carte (Leaflet)** : le transporteur partage sa position depuis son téléphone (« Partager ma position », toutes les ~10 s). Le client voit le camion se déplacer, la trace, la vitesse et les km restants. Sans GPS récent, la position est **estimée** d’après l’horaire le long de l’itinéraire. Confidentialité : le client ne voit la position **que pendant le transport**. Fond de carte clair/sombre ; fournisseur configurable (`VITE_TILE_URL`).
- **Tableau de bord d’administration complet** (`/admin`, mise en page large) : indicateurs clés, graphiques sur 30 jours (réservations, valeur, inscriptions), répartition par statut, lignes et transporteurs les plus actifs, gestion des utilisateurs, modération des trajets/avis, réservations, tickets de support, **journal d’audit**, export CSV (protégé contre l’injection de formules).
- **Privilèges individuels** : en plus des 4 rôles (`customer`, `carrier`, `support`, `admin`), l’admin peut **accorder ou retirer un droit précis à un utilisateur** (surcharge allow/deny) — effet immédiat, tracé dans l’audit. Droits réservés à l’admin non accordables ; un transporteur non validé ne peut rien contourner.
- **Support / litiges** : tout utilisateur ouvre un ticket (éventuellement lié à SA réservation) ; les agents de support répondent et résolvent, avec notifications.
- **Repère de marché** : le transporteur voit le prix moyen au kilo de la ligne avant de publier.
- **RGPD** : export de ses données (JSON) et suppression du compte (données personnelles effacées, historique conservé anonymisé).

- **Code de livraison (PIN à 4 chiffres)** : généré à la réservation, visible uniquement par le client. Le transporteur doit le saisir pour marquer « livré » ; 5 essais erronés → `PIN_LOCKED` (l’admin peut clôturer). Protège contre les fausses livraisons.
- **Messagerie par réservation** : seuls le client et le transporteur concernés y accèdent (l’admin n’a pas accès aux messages privés). Non-lus, rafraîchissement automatique.
- **Centre de notifications** : nouvelle réservation, changement de statut, nouvel avis, compte transporteur validé. Badges sur la cloche et sur l’onglet Messages.
- **Avis réels** : après livraison, le client note le transporteur (1–5 + commentaire). La note moyenne est recalculée ; seuls les prénoms sont publics.
- **PWA** : application installable (manifest + service worker). Seule la « coquille » est mise en cache — jamais les réponses `/api` (données privées).

## Rôles et privilèges (RBAC)

Quatre rôles (`customer`, `carrier`, `support`, `admin`) + surcharges individuelles ; l’autorité est **toujours le serveur** (les gardes du front ne servent qu’à l’ergonomie). L’utilisateur est relu en base à chaque requête : changement de rôle, désactivation ou changement de mot de passe sont **immédiats** (aucun privilège figé dans le JWT).

| Action | Visiteur | Client | Transporteur actif | Admin |
|---|:-:|:-:|:-:|:-:|
| Rechercher / voir les trajets | ✅ | ✅ | ✅ | ✅ |
| Réserver (`bookings:create`) | – | ✅ | – | ✅ |
| Voir ses réservations / les réservations de **ses** trajets / toutes | – | siennes | de ses trajets | toutes |
| Annuler **sa** réservation (en attente/confirmée) | – | ✅ | – | ✅ |
| Confirmer / refuser / faire avancer le statut | – | – | **ses** trajets | ✅ |
| Publier / modifier / annuler / supprimer un trajet | – | – | **les siens** | tous |
| Suivi d’un envoi (`/tracking/:ref`) | – | le sien | ses trajets | tous |
| Favoris | – | ✅ | ✅ | ✅ |
| Messagerie d’une réservation | – | participant | participant | ❌ (messages privés) |
| Noter le transporteur (après livraison, 1 fois) | – | ✅ propriétaire | – | – |
| Notifications | – | ✅ | ✅ | ✅ |
| Voir toutes les réservations / utilisateurs / stats | – | – | – | ✅ (support : lecture) |
| Utilisateurs : rôles, validation, **privilèges individuels** | – | – | – | ✅ |
| Modérer trajets et avis | – | – | – | ✅ (support aussi) |
| Journal d’audit, export CSV | – | – | – | ✅ |
| Tickets de support : ouvrir / traiter | – | ouvrir | ouvrir | traiter (support & admin) |
| Partager la position GPS | – | – | ✅ ses trajets | – |

Règles notables :
- Inscription publique **client** ou **transporteur** uniquement ; `admin` ne peut jamais être demandé (400).
- Un transporteur est **`pending`** jusqu’à validation par un admin : il peut se connecter mais reçoit `403 CARRIER_NOT_APPROVED` pour publier/gérer.
- Accès à la réservation/suivi d’un tiers → **404** (pas d’énumération). Coordonnées du client visibles uniquement par le client, le transporteur du trajet et l’admin.
- Réservation transactionnelle : décrément atomique de la capacité (pas de sur-réservation), restitution en cas d’annulation/refus.
- Machine d’états : `pending → confirmed → picked_up → in_transit → arrived → delivered` (+ `cancelled`/`rejected`). Chaque transition crée un événement de suivi.
- Admin : pas d’auto-modification, impossible de retirer le dernier admin.
- Sécurité : bcrypt, JWT HS256 (8 h), helmet, CORS restreint, rate-limit login/inscription, validation `zod` partout, requêtes SQL paramétrées.

## API (`/api`)

`POST /auth/register|login` · `GET|PATCH /auth/me` · `POST /auth/me/password` ·
`GET /trips` (public, filtres `weight cargo vehicle date gps`) · `GET /trips/mine` · `GET|PATCH|DELETE /trips/:id` · `POST /trips` ·
`POST|GET /bookings` · `GET /bookings/:id` · `PATCH /bookings/:id/status` · `POST /bookings/:id/events` ·
`POST /bookings/:id/review` · `GET /trips/:id/reviews` · `GET /messages` · `GET|POST /messages/:bookingId` · `GET /notifications` · `GET /notifications/summary` · `POST /notifications/read-all` ·
`GET /tracking/:reference` · `GET /favorites` · `PUT|DELETE /favorites/:tripId` ·
`POST /trips/:id/positions` (GPS) · `GET|POST /tickets` · `GET /tickets/:id` · `POST /tickets/:id/messages` · `PATCH /tickets/:id` · `GET /insights/price` ·
`GET /auth/me/export` · `DELETE /auth/me` ·
`GET /admin/users` · `PATCH /admin/users/:id` · `GET|PUT /admin/users/:id/permissions` · `GET /admin/overview` · `GET /admin/trips` · `GET /admin/reviews` · `PATCH /admin/reviews/:id` · `GET /admin/audit` · `GET /admin/export/bookings.csv` · `GET /admin/stats` · `GET /health`

Erreurs : `{ "error": { "code": "INSUFFICIENT_CAPACITY", "message": "…" } }` — le front traduit chaque `code` (`err.<CODE>`).

## Tests

```bash
cd backend  && npm test     # 57 tests : RBAC, privilèges individuels, colis 1–60 kg, GPS, support, audit, RGPD, fuseaux, migrations…
cd frontend && npm test     # 25 tests : fuseaux/durées, validation des critères d'URL, cohérence des 6 dictionnaires i18n
```

## Dates et fuseaux horaires

Les dates de trajet sont stockées en heure murale sans fuseau (`YYYY-MM-DDTHH:mm`) :
- le **départ** est l'heure du lieu de départ (Tunisie, `Africa/Tunis`) ;
- l'**arrivée** est l'heure du lieu d'arrivée (`Europe/Paris` ou `Europe/Rome`, avec heure d'été).

Toute comparaison (trajet passé, arrivée avant départ, durée, ETA) convertit d'abord en instant réel (`wallToInstant` dans `backend/src/domain.ts` et `frontend/src/lib/format.ts`) : le résultat ne dépend ni du fuseau du serveur ni de celui du navigateur.

## Base de données et migrations

Le schéma est versionné avec `PRAGMA user_version` (`MIGRATIONS` dans `backend/src/db.ts`), appliqué au démarrage, chaque migration dans une transaction. Pour modifier le schéma, **ajouter** une entrée à la fin de la liste (n° suivant) ; ne jamais modifier une migration déjà publiée. Une base plus récente que le code, ou antérieure au rôle `support`, est refusée avec un message explicite.

## Notes

- Base SQLite : `backend/data/transconnect.db` (WAL). Pour PostgreSQL/MySQL, seul `backend/src/db.ts` + les requêtes SQL de `routes/` et `services.ts` sont à adapter.
- Les photos de véhicules sont choisies côté front selon le type de véhicule ; la messagerie n’est pas temps réel (rafraîchissement toutes les 6 s) et les paiements ne sont pas implémentés.
- Les itinéraires affichés sont approximatifs (tracé + traversée maritime) ; ils servent à l’affichage et à l’estimation, pas à la navigation.
- Le partage GPS nécessite HTTPS en production (exigence des navigateurs) et fonctionne tant que la page du transporteur reste ouverte.
- Une base SQLite d'avant le rôle `support` ne peut pas être migrée automatiquement : supprimez `backend/data/` (l'application le dit au démarrage).
