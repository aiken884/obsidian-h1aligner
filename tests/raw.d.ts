// vitest/vite `?raw` imports (used to assert on styles.css text).
declare module '*?raw' {
    const content: string;
    export default content;
}
