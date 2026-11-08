// Type declarations for Deno runtime in Supabase Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
