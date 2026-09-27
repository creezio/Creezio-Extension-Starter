---
name: test-and-package
description: Qualifier les six suites du module et vérifier les archives runtime et validation liées à la source exacte.
---

# Tests et paquets

Lire [AGENTS.md](../../../AGENTS.md), [FILES.md](../../../FILES.md) et le [guide public de packaging fixé à `8736c340`](https://github.com/creezio/Creezio-D1R2/blob/8736c3407981c29acd637a86b669c8f72fc09b10/skills/development/test-and-package/SKILL.md). Exécuter les six suites `backend`, `ui`, `api-mcp`, `widgets`, `package`, `docs` ; une suite absente, vide, skipped ou incomplète ne vaut pas succès.

Lier les résultats au commit source réel, au manifeste généré et aux octets des archives. Vérifier le paquet npm extrait contre l'inventaire runtime : JS/d.ts compilés, assets, plugin, skill conversationnel et documents installés ; ni sources TS, ni tests, ni secrets, ni données de démo. L'archive de validation conserve les tests et scripts, séparés du Worker. Recompiler depuis la source fixée avant l'emballage ou comparer strictement les octets compilés à un build reproductible ; un `dist/` ignoré et altéré ne doit pas devenir une release attribuée à la bonne source.

Installer l'archive réelle dans une application indépendante, puis vérifier lecture/mutation autorisée, refus, fichier et widget. Distinguer contrôle local, navigateur, Sites, Cloudflare et ChatGPT ; rapporter les limites sans réutiliser une preuve d'un ancien SHA.
