# Data Mapping — IML Reference

Complete reference for Make.com's Integrated Mapping Language (IML).

---

## Expression Syntax

```
{{moduleId.fieldPath}}
```

- `moduleId` = the integer `id` of the source module
- `fieldPath` = dot-notation path to the field

```javascript
{{1.data}}                  // Full body/data from module id 1
{{1.customer.email}}        // Nested: customer.email
{{1.items[0].name}}         // First array item's name field
{{1.data.results[2].id}}    // Third result's id
```

---

## Expression in Different Contexts

### In string values
```json
{
  "text": "Order #{{1.order_number}} from {{1.customer.email}} for ${{1.total_price}}"
}
```

### As the entire value
```json
{
  "amount": "{{1.total_price}}"
}
```

### In nested objects
```json
{
  "values": {
    "0": "{{1.id}}",
    "1": "{{1.name}}"
  }
}
```

### In JSON body strings (for HTTP module)
```json
{
  "body": "{\"name\": \"{{1.name}}\", \"email\": \"{{1.email}}\"}"
}
```
⚠️ When IML is inside a JSON string value, the outer quotes remain part of the string.

---

## String Functions

```
trim(text)                    Remove leading/trailing whitespace (one-argument form)
ltrim(text)                   Remove leading whitespace
rtrim(text)                   Remove trailing whitespace
lower(text)                   Lowercase
upper(text)                   Uppercase
capitalize(text)              First letter uppercase
length(text)                  String length
contains(text, search)        → true/false
startsWith(text, prefix)      → true/false
endsWith(text, suffix)        → true/false
substring(text, start, end)   Slice string
indexOf(text, search)         First index of search (-1 if not found)
replace(text, search, replacement)  Replace first occurrence
replaceAll(text, search, replacement) Replace all occurrences
split(text, delimiter)        → array of strings
repeat(text, n)               Repeat text n times
padStart(text, n, char)       Pad left to length n
padEnd(text, n, char)         Pad right to length n
trim(text, char)              Trim specific character (two-argument form)
reverse(text)                 Reverse string
md5(text)                     MD5 hash
sha1(text)                    SHA1 hash
sha256(text)                  SHA256 hash
base64(text)                  Base64 encode
base64decode(text)            Base64 decode
encodeURL(text)               URL encode
decodeURL(text)               URL decode
escapeHTML(text)              Escape HTML special chars
```

### Examples
```
{{lower({{1.email}})}}
{{replace({{1.name}}, " ", "_")}}
{{split({{1.tags}}, ",")}}
{{join({{1.items}}, ", ")}}
{{substring({{1.description}}, 0, 100)}}
{{trim({{1.text}})}}
{{upper({{1.status}})}}
```

---

## Number Functions

```
add(a, b)          a + b
subtract(a, b)     a - b
multiply(a, b)     a * b
divide(a, b)       a / b
mod(a, b)          a % b (remainder)
ceil(n)            Round up
floor(n)           Round down
round(n)           Round to nearest
abs(n)             Absolute value
max(a, b, ...)     Maximum value
min(a, b, ...)     Minimum value
sum(array)         Sum of array numbers
average(array)     Average of array numbers
parseNumber(text)  Parse string to number
formatNumber(n, decimalPlaces)  Format with decimals
```

### Examples
```
{{add({{1.subtotal}}, {{1.tax}})}}
{{multiply({{1.price}}, {{1.quantity}})}}
{{round({{1.amount}}, 2)}}
{{formatNumber({{1.total}}, 2)}}
{{sum({{1.items}})}}
```

---

## Date Functions

```
now                                   Current datetime
timestamp                             Current Unix timestamp
formatDate(date, format)              Format a date
parseDate(string, format)             Parse string to date
addDays(date, n)                      Add n days
addHours(date, n)                     Add n hours
addMinutes(date, n)                   Add n minutes
addSeconds(date, n)                   Add n seconds
subtractDays(date, n)                 Subtract n days
dateDifference(date1, date2, unit)    Difference (days/hours/minutes)
startOfDay(date)                      Start of day (midnight)
endOfDay(date)                        End of day (23:59:59)
setTimeZone(date, tz)                 Convert timezone
dayOfMonth(date)                      Day 1–31
dayOfWeek(date)                       Day 1–7 (Mon=1)
dayOfYear(date)                       Day 1–366
weekOfYear(date)                      Week number
month(date)                           Month 1–12
year(date)                            Year
hours(date)                           Hours 0–23
minutes(date)                         Minutes 0–59
```

### Format Tokens
```
YYYY  Four-digit year      (2026)
YY    Two-digit year       (26)
MMMM  Full month name      (March)
MMM   Short month name     (Mar)
MM    Month with leading 0 (03)
M     Month without 0      (3)
DD    Day with leading 0   (11)
D     Day without 0        (11)
HH    Hour 24h with 0      (14)
H     Hour 24h             (14)
hh    Hour 12h with 0      (02)
mm    Minutes with 0       (30)
ss    Seconds with 0       (00)
A     AM/PM
x     Unix timestamp (ms)
X     Unix timestamp (s)
```

### Examples
```
{{formatDate(now, "YYYY-MM-DD")}}           → "2026-03-11"
{{formatDate(now, "DD/MM/YYYY HH:mm:ss")}}  → "11/03/2026 14:30:00"
{{formatDate({{1.createdAt}}, "MMMM D, YYYY")}}
{{addDays(now, 30)}}                         → 30 days from now
{{dateDifference(now, {{1.dueDate}}, "days")}}
```

---

## Conditional Functions

```
if(condition, trueValue, falseValue)
ifempty(value, fallback)
switch(input, case1, result1, case2, result2, ..., default)
```

### Condition Operators
```
==    Equal
!=    Not equal
>     Greater than
>=    Greater than or equal
<     Less than
<=    Less than or equal
&&    AND
||    OR
!     NOT
```

### Examples
```
{{if(1.amount > 1000, "VIP", "Standard")}}
{{if(1.status == "active", "✓", "✗")}}
{{ifempty(1.phone, "No phone provided")}}
{{if(1.score >= 90, "A", if(1.score >= 80, "B", "C"))}}
{{switch(1.color, "red", "#FF0000", "blue", "#0000FF", "#000000")}}
```
Inside `{{...}}`, reference module fields without extra braces: `1.field`, not `{{1.field}}`.

---

## Array Functions

```
first(array)              First element
last(array)               Last element
length(array)             Array length
slice(array, start, end)  Subset of array
sort(array)               Sort ascending
sortBy(array, field)      Sort by field
reverse(array)            Reverse array
flatten(array)            Flatten nested arrays
distinct(array)           Remove duplicates
filter(array, value)      Keep matching items
remove(array, index)      Remove item at index
add(array, value)         Add item to end
merge(array1, array2)     Combine arrays
contains(array, value)    → true/false
indexOf(array, value)     Index of value (-1 if not found)
map(array, key)           Extract field from each object
sum(array)                Sum all numbers
average(array)            Average all numbers
```

### Examples
```
{{first({{1.results}})}}
{{length({{1.items}})}}
{{join(map({{1.tags}}, "name"), ", ")}}
{{sort({{1.scores}})}}
{{filter({{1.orders}}, "completed")}}
{{contains({{1.roles}}, "admin")}}
```

---

## Type Conversion

```
toString(value)         Convert to string
toNumber(value)         Convert to number
toBool(value)           Convert to boolean
toArray(value)          Wrap value in array
parseJSON(string)       Parse JSON string
stringify(value)        Convert to JSON string
```

---

## Data Flow Reference

When module 1 is `gateway:CustomWebHook`:
```
{{1.data}}              Full webhook body
{{1.data.field}}        JSON body field
{{1.headers.x-api-key}} Request header
{{1.query.param}}       URL query param
{{1.method}}            HTTP method
```

When module 1 is `http:ActionSendData`:
```
{{1.data}}              Parsed response body (if parseResponse: true)
{{1.data.field}}        Field in response
{{1.status}}            HTTP status code (200, 404, etc.)
{{1.headers}}           Response headers
```

When module is Google Sheets `watchRows`:
```
{{N.__ROW_NUMBER__}}    Row number in sheet
{{N.__SPREADSHEET_ID__}} Spreadsheet ID
{{N.ColumnName}}        Value in named column
{{N["Column Name"]}}    Value in column with spaces
```

---

## Common Expression Patterns

```
// Concatenate fields
"{{1.firstName}} {{1.lastName}}"

// Format currency
"${{formatNumber({{1.amount}}, 2)}}"

// Conditional prefix
"{{if({{1.isPriority}}, "🔴 ", "")}}{{1.title}}"

// Format date in message
"Updated on {{formatDate(now, \"MMMM D, YYYY\")}}"

// Extract from array
"{{1.data.tags[0].name}}"

// Safe field access
"{{ifempty({{1.company}}, "Unknown Company")}}"

// URL encode for query string
"?q={{encodeURL({{1.searchTerm}})}}"
```
