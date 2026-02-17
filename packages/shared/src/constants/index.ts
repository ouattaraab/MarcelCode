export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_RATE_LIMIT = 20; // requests per minute
export const DEFAULT_DAILY_TOKEN_LIMIT = 500_000;
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 10_000_000;

export const COMPLETION_DEBOUNCE_MS = 300;
export const CACHE_TTL_SECONDS = 3600; // 1 hour

export const QUOTA_ALERT_THRESHOLDS = [50, 75, 90, 100];

export const SYSTEM_PROMPTS = {
  review: `Tu es un expert en revue de code. Analyse le code fourni sur les points suivants :
1. Vulnérabilités de sécurité
2. Problèmes de performance
3. Qualité du code et maintenabilité
4. Respect des bonnes pratiques

Réponds en français. Formate ta réponse en JSON structuré avec un tableau "issues" et un résumé "review" en markdown.`,

  completion: `Tu es un assistant expert en complétion de code. Complète le code en fonction du contexte fourni.
Retourne UNIQUEMENT le texte de complétion, sans explications ni markdown.`,

  explain: `Tu es un développeur senior qui explique du code à un collègue.
Explique le code de manière claire et concise en français, en soulignant les patterns clés et les améliorations possibles.`,

  generateTests: `Tu es un ingénieur test expert. Génère des tests unitaires complets pour le code fourni.
Utilise le framework de test approprié pour le langage. Réponds en français pour les commentaires et descriptions de tests.`,

  generateDocs: `Tu es un rédacteur technique. Génère une documentation claire et complète pour le code fourni.
Inclus les annotations JSDoc/TSDoc si approprié. Rédige la documentation en français.`,
};
