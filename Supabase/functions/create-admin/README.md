# OrdiMarket — create-admin

Cette Edge Function permet au `super_admin` de créer un administrateur depuis `admin/team.html`.

Le compte est créé via `inviteUserByEmail` : aucun mot de passe n’est demandé ni stocké. Supabase envoie une invitation au nouvel utilisateur. Le lien redirige vers `admin/set-password.html`, où l’utilisateur choisit lui-même son mot de passe.

## Déploiement

```bash
supabase functions deploy create-admin
```

## Configuration Supabase à vérifier

Dans Authentication > URL Configuration, autoriser cette URL de redirection :

```text
https://gilbertdagbemon-cell.github.io/commercialisation-de-mat-riel-informatique-/admin/set-password.html
```

Le modèle d’e-mail d’invitation doit utiliser `{{ .ConfirmationURL }}` pour le lien d’invitation.

La clé `SUPABASE_SERVICE_ROLE_KEY` est utilisée uniquement côté Edge Function et ne doit jamais être exposée au frontend.
