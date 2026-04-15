# Guide de démarrage

## Mise en place de l'environnement

1. **Cloner le dépôt**
   ```bash
   git clone <url-du-depot>
   cd IH
   ```

2. **Configurer la connexion Divalto**
   ```bash
   cp config/config.example.ini config/config.ini
   # Éditer config/config.ini avec vos paramètres
   ```

3. **Vérifier la connexion**
   - S'assurer que le serveur Divalto est accessible
   - Vérifier les droits utilisateur

## Structure des sources

- `src/` : Contient les modules et personnalisations Divalto
- `config/` : Fichiers de configuration (hors `config.ini` qui est ignoré par git)
- `docs/` : Documentation du projet
- `tests/` : Scripts et procédures de test
