// Side-effect CSS imports carry no types — declare them so tsc compiles. They're
// resolved at runtime by the consuming app's bundler (Vite).
declare module "*.css";
