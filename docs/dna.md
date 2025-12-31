# Blinx DNA

## 1. Surface Design Goals - ABCDEF

Blinx intend to deliver these below values to clients

A - Agnostic architecture  
B - Beginner friendly API  
C - Centralization of customization source  
D - Declarative way of coding  
E - Extensible points to alter built-in behavior  
F - Flexible enough to handle wide range of usage  

## 2. Internal Design Principle - SOLID

Internally Blinx developers still adhere to SOLID:

### S — Single Responsibility Principle (SRP)

the “responsibility” is usually:

- Data / state
- Rendering
- Side effects

In Blinx, SRP often means splitting by concern, not by file count.

👉 SRP ≠ “one component per tiny thing”  
👉 SRP = “one reason to change”  

### O — Open/Closed Principle (OCP)

Blinx delivers component-base ui e.g., blinxForm, blinxTable, blinxCollection, etc. and those components provide props, API to alter their behaviors and UX/UI.

✔️ OCP is very natural in component-based UI.

### L — Liskov Substitution Principle (LSP)

Rarely about class inheritance anymore — more about API contracts.

If a component claims to accept a prop shape or behavior, all implementations must honor it.

In practice:

- Stable prop contracts
- Predictable behavior
- No “special case” components

LSP matters most in design systems & shared components.

### I — Interface Segregation Principle (ISP)

Very important in UI props design.

Avoid “god props”, Prefer:

- Variants
- Composed subcomponents
- Smaller focused APIs

ISP maps cleanly to headless UI & compound components.

### D — Dependency Inversion Principle (DIP)

DIP is huge in modern UI — in Blinx just expressed differently.

Instead of:

- Hard-coded fetch
- Direct imports of global services

Prefer:

- Hooks
- Context
- Injected adapters

This enables:

- Testing
- SSR
- Multiple backends
- Platform portability

DIP is why headless + adapters works so well.

## 3. Codebase Convention - WREST

W - Well organized file structure  
R - Readability focus  
E - Explicitly declaring starting point  
S - Self-explanatory and story-telling coding  
T - Testability  

W makes it easier for Blinx developers to find things, folder should have clear meaning and intuitive name.

R makes it easier for one developer to read an understand others’ code.

E helps avoiding developers having to spend time finding or guessing where to start reading from.

S makes interpreting existing code easier. Instead of spreading hundreds statements over the source file grouping and sequencing them in meaningful ways and explicitly make code’s purpose visible in human-readable manner, clear, guessable, in story-telling ways so that readers can understand them even without comments.

T - try to make code testable in fine grain. When possible make function context-independent so that they can be exported and test without having to concern with coding security.

