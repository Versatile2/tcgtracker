# Stockage des leaders

Périmètre : les deux tables qui portent les leaders (`leaders`, `leader_art`) et
les colonnes qui les référencent depuis `tournaments` / `rounds`.
Source : [src/db/schema.ts](../src/db/schema.ts).

```mermaid
erDiagram
    leaders {
        uuid id PK "defaultRandom()"
        text name "NOT NULL"
        text_array colors "NOT NULL, default '{}'"
        text set_code "nullable — null pour un leader custom"
        boolean is_custom "NOT NULL, default false"
        text owner_id "nullable — null = seed global"
        timestamptz created_at "NOT NULL, defaultNow()"
    }

    leader_art {
        text owner_id PK "NOT NULL"
        text set_code PK "NOT NULL — pas de FK, voir note"
        text art "NOT NULL — ex. 'OP06-022_p2'"
        timestamptz updated_at "NOT NULL, defaultNow()"
    }

    tournaments {
        uuid id PK
        text owner_id "NOT NULL"
        uuid my_leader_id FK "nullable — null pour type 'session'"
        uuid meta_id FK
        enum type
        date played_on "NOT NULL"
    }

    rounds {
        uuid id PK
        uuid tournament_id FK "NOT NULL, ON DELETE CASCADE"
        uuid opponent_leader_id FK "nullable — null sur bye / no_show"
        uuid my_leader_id FK "nullable — rempli seulement sur les rounds de session"
        uuid opponent_meta_id FK
        integer round_number "NOT NULL"
        enum result "NOT NULL"
    }

    leaders ||--o{ tournaments : "my_leader_id (leader du joueur pour l'event)"
    leaders ||--o{ rounds : "opponent_leader_id (leader adverse)"
    leaders ||--o{ rounds : "my_leader_id (leader du joueur, par round)"
    tournaments ||--o{ rounds : "tournament_id"
    leaders ||..o{ leader_art : "set_code — lien logique, PAS de FK"
```

## Notes

**`leaders`** — un seul catalogue pour les leaders officiels et les leaders custom.
`owner_id = null` ⇒ ligne de seed globale, visible par tout le monde ;
`owner_id` renseigné + `is_custom = true` ⇒ leader créé par ce joueur.
`set_code` est le code carte officiel (`OP06-022`) et reste null sur les customs.

**`leader_art`** — préférence purement cosmétique : quelle impression du leader
(base, Parallel, Alternate Art, SPR) le joueur veut voir. Clé primaire composite
`(owner_id, set_code)`.

- Volontairement **sans clé étrangère** vers `leaders.id` : les `id` sont réattribués
  à chaque reseed, les `set_code` non. Le lien se fait donc par `set_code`.
- **Absence de ligne = impression de base.** La table ne contient que les écarts
  réels au défaut.
- Les leaders custom (pas de `set_code`, pas d'art) n'y apparaissent jamais.
- `art` référence un `card_image_id` de `LEADER_ART[setCode]` dans
  [src/lib/leader-images.ts](../src/lib/leader-images.ts) — la liste des impressions
  disponibles vit dans le code, pas en base.
- Rien dans les statistiques ne lit cette table : un leader reste un leader quelle
  que soit son illustration.

**Où le leader est enregistré** — `tournaments.my_leader_id` pour un event à leader
unique ; pour les `session`, il est null et c'est `rounds.my_leader_id` qui porte le
leader, round par round.
