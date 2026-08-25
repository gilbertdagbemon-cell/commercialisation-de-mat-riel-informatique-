# OrdiMarket — create-admin

Cette Edge Function permet au `super_admin` de créer un administrateur depuis `admin/team.html`.

Le compte est créé via `inviteUserByEmail` : aucun mot de passe n'est demandé ni stocké dans le frontend. Supabase envoie une invitation au nouvel utilisateur. Le lien redirige vers `admin/set-password.html`, où l'utilisateur choisit son mot de passe.

## Déploiement

Depuis la racine du projet :

```bash
npx supabase functions deploy create-admin --project-ref cxwsjejfxfknctrtyjjc
```

La configuration `supabase/config.toml` active explicitement la vérification JWT pour `create-admin`.

## Configuration Supabase à vérifier

Dans **Authentication > URL Configuration**, autoriser :

```text
https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-/admin/set-password.html
```

Le modèle d'e-mail d'invitation doit utiliser `{{ .ConfirmationURL }}` pour le lien.

## Sécurité

- `SUPABASE_SERVICE_ROLE_KEY` est utilisée uniquement côté Edge Function.
- Elle ne doit jamais être placée dans `config.js`, `admin/config.js` ou un fichier servi par GitHub Pages.
- Le frontend transmet uniquement la session JWT de l'administrateur connecté.
- La fonction vérifie le JWT puis vérifie côté serveur que l'appelant est un `super_admin` actif avant toute création.
- La fonction répond aux requêtes CORS `OPTIONS` et aux requêtes POST du domaine GitHub Pages.
