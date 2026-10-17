# Formatting Rules for DA_PromptFormatter

1. **Remove consecutive spaces**  
   Collapses multiple spaces into a single one.  
   *Example:* `hello  world` → `hello world`

2. **Collapse repeated punctuation**  
   Merges consecutive commas or periods into a single character.  
   *Example:* `,,text..` → `,text.`

3. **Convert multiple brackets to weights**  
   Transforms nested parentheses/brackets into standardized weight notation `(content:weight)`.  
   - Round brackets `()` increase weight by factor 1.1 per pair.  
   - Square brackets `[]` decrease weight by factor 0.9 per pair.  
   *Example:* `((girl))` → `(girl:1.21)` | `[[bad]]` → `[bad:0.81]`

4. **Add space after punctuation (Smart Spacing)**  
   Adds a space after a comma or period if followed by a letter or digit, **unless** it is part of a decimal number (e.g., `1.5` or `:1.2`).  
   *Example:* `,text` → `, text` | `scale:1.5m` → `scale: 1.5m` (protected)

5. **Trim spaces inside brackets**  
   Removes spaces immediately after opening brackets and before closing brackets.  
   *Example:* `( girl )` → `(girl)` | `[ bad ]` → `[bad]`

   **5.1. Normalize weight syntax**  
   Cleans up random gaps inside weight definitions (around the colon and decimal point).  
   *Example:* `(girl : 1 . 2)` → `(girl:1.2)`

6. **Remove spaces before punctuation**  
   Ensures no whitespace exists between a word and its following period or comma.  
   *Example:* `word .` → `word.`

7. **Normalize line breaks**  
   - Converts Windows line endings (`\r\n`) to Unix (`\n`).  
   - Removes trailing spaces/tabs before newlines.  
   - Collapses multiple empty lines into a single newline.  
   - Trims leading and trailing newlines from the entire prompt.  
   *Example:* `\n\n\n` → `\n`