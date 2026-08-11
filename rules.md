# Development Rules for School Finance Refactor

## 1. Form Handling (React Hook Form + Zod)

- **ALL forms** must use `react-hook-form` with `zodResolver` for validation.
- Use `<Controller />` for controlled inputs.
- Use `<Field />`, `<FieldLabel />`, `<FieldError />` components for accessibility.
- Add `data-invalid={fieldState.invalid}` to `<Field />`.
- Add `aria-invalid={fieldState.invalid}` to form controls (`<Input />`, `<SelectTrigger />`, etc.).
- Validation mode: `mode: "onChange"` for immediate feedback.
- Reset forms with `form.reset()` after successful submission.
- For array fields, use `useFieldArray` with `field.id` as the React key.
- Define Zod schemas close to the component or in a dedicated `schemas/` file.
- Transform and coerce numeric/currency values from strings before validation.

## 2. Table Handling (TanStack Query Table)

- **ALL tables** must use `@tanstack/react-table` (TanStack Query Table).
- Implement pagination, sorting, and filtering via TanStack Table APIs.
- Use server-side pagination for large datasets (>50 rows).
- Use the reusable `DataTable` component wrapping TanStack Table logic.
- Loading states: show skeleton loaders, never leave table empty without feedback.
- Column definitions must be typed using `ColumnDef<TData>`.

## 3. Reusable Components

- Extract common UI patterns into reusable components in `/components/reusable/`:
  - `DataTable` — Generic TanStack table with pagination, sorting, filtering
  - `FormDialog` — Dialog wrapper with form reset on close
  - `SearchableSelect` — Async searchable dropdown (for students, employees, billings)
  - `StatusBadge` — Consistent status badges with variant mapping
  - `CurrencyInput` — Rupiah-formatted input with Rp prefix
  - `InstallmentPlanPreview` — Shows installment breakdown preview
  - `WizardModal` — Multi-step modal with progress bar, Back/Next
- Never duplicate form logic; compose from reusable pieces.
- Keep components focused on a single responsibility.

## 4. API & Data Fetching

- Use TanStack Query (`@tanstack/react-query`) for all server state.
- Use `useMutation` for POST/PUT/PATCH/DELETE operations with optimistic updates where appropriate.
- Invalidate related queries after mutations (`queryClient.invalidateQueries`).
- Keep API routes RESTful and consistent.
- API validation must use Zod on both client and server.

## 5. Financial Integration (Jurnal + COA + Buku Besar + Laporan)

- Every payment (full or installment) must call `postToJournal()` to create Journal Entries.
- Update COA account balances atomically within Prisma transactions.
- Ensure cashflow records are created alongside journal entries for traceability.
- Use the existing `PAYMENT_TYPE_ACCOUNTS` and `feeTypeToAccountCode` mappings.
- Student revenue: Pendaftaran=4-0101, Gedung/Uang Pangkal=4-0102, Kegiatan=4-0103, Seragam=4-0104, ATK=4-0105, SPP=4-0106, default=4-0201.
- Employee expenses: Gaji=5-0101, Tunjangan=5-0102, Bonus=5-0102.
- **ISAK 35 Compliance:** All reports must follow ISAK 35 standards (see `transaction.md` for full details).
- **Aset Neto Classification:** Must track Tidak Terikat (3-1xxx), Terikat Sementara (3-2xxx), Terikat Permanen (3-3xxx).
- **Cash Flow Classification:** Every cashflow record must have category: Operasi (CF-OPS), Investasi (CF-INV), Pendanaan (CF-FIN).
- **Four Mandatory Reports:** Laporan Posisi Keuangan, Laba Rugi, Perubahan Aset Neto, Arus Kas + CaTK.

## 6. Context7 Usage

- Always use Context7 to fetch current documentation for libraries/frameworks.
- Use `resolve-library-id` first, then `query-docs`.
- Apply to: React Hook Form, Zod, TanStack Query, TanStack Table, shadcn/ui, Prisma, Next.js App Router.
- Prefer Context7 over web search for library documentation.

## 7. Code Style & Patterns

- Follow existing project conventions (Tailwind CSS v4, shadcn/ui, App Router).
- Use TypeScript strictly — avoid `any` types.
- Use `formatRupiah()`, `formatNumberInput()`, `parseFormattedNumber()` for currency.
- Use `useDebounce()` for search inputs.
- Use `toast.promise()` for async operations with loading/success/error states.
- Prefer server-side rendering where possible; use `"use client"` only when necessary.
- Keep business logic in dedicated service files under `/lib/services/`.

## 8. You Might Not Need an Effect (React Effects Best Practices)

Effects are an escape hatch from the React paradigm. They let you "step outside" of React and synchronize your components with some external system like a non-React widget, network, or the browser DOM. If there is no external system involved, you shouldn't need an Effect.

### When NOT to use Effects

- **Don't use Effects to transform data for rendering.** Calculate derived data at the top level of your components. When you update state in an Effect, React renders twice (once with stale value, then with updated value).
- **Don't use Effects to handle user events.** If you know *what* the user did (e.g., which button was clicked), handle it in the event handler. By the time an Effect runs, you don't know *what* the user did.

### Data Transformation

```typescript
// 🔴 Bad: redundant state and unnecessary Effect
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// ✅ Good: calculated during rendering
const fullName = firstName + ' ' + lastName;
```

**Rule:** When something can be calculated from existing props or state, don't put it in state. Calculate it during rendering.

### Caching Expensive Calculations

```typescript
// 🔴 Bad: Effect to update filtered list
const [visibleTodos, setVisibleTodos] = useState([]);
useEffect(() => {
  setVisibleTodos(getFilteredTodos(todos, filter));
}, [todos, filter]);

// ✅ Good: useMemo for expensive calculations
const visibleTodos = useMemo(
  () => getFilteredTodos(todos, filter),
  [todos, filter]
);
```

**Rule:** Use `useMemo` for expensive calculations. It only re-runs when dependencies change.

### Resetting State

```typescript
// 🔴 Bad: Resetting state on prop change in an Effect
useEffect(() => {
  setComment('');
}, [userId]);

// ✅ Good: Use key prop to reset component state
return <Profile userId={userId} key={userId} />;
```

**Rule:** Pass `key` prop to reset entire component state. React treats different keys as different components.

### Adjusting State on Prop Changes

```typescript
// 🔴 Bad: Adjusting state in an Effect
useEffect(() => {
  setSelection(null);
}, [items]);

// ✅ Good: Calculate during rendering
const selection = items.find(item => item.id === selectedId) ?? null;
```

**Rule:** Store selected ID, not selected object. Calculate the full selection during rendering.

### Event Handlers vs Effects

```typescript
// 🔴 Bad: Event-specific logic inside an Effect
useEffect(() => {
  if (product.isInCart) {
    showNotification(`Added ${product.name} to cart!`);
  }
}, [product]);

// ✅ Good: Event-specific logic in event handlers
function handleBuyClick() {
  addToCart(product);
  showNotification(`Added ${product.name} to cart!`);
}
```

**Rule:** If logic is caused by a particular interaction, keep it in the event handler. If it's caused by the user *seeing* the component, keep it in the Effect.

### Sending POST Requests

```typescript
// 🔴 Bad: POST request in an Effect
useEffect(() => {
  if (jsonToSubmit !== null) {
    post('/api/register', jsonToSubmit);
  }
}, [jsonToSubmit]);

// ✅ Good: POST request in event handler
function handleSubmit(e) {
  e.preventDefault();
  post('/api/register', { firstName, lastName });
}
```

**Rule:** Send POST requests in event handlers, not Effects. The request should happen because the user pressed the button, not because the component was displayed.

### Chains of Computations

```typescript
// 🔴 Bad: Chains of Effects that adjust state to trigger each other
useEffect(() => {
  if (card !== null && card.gold) {
    setGoldCardCount(c => c + 1);
  }
}, [card]);

useEffect(() => {
  if (goldCardCount > 3) {
    setRound(r => r + 1);
    setGoldCardCount(0);
  }
}, [goldCardCount]);

// ✅ Good: Calculate all next state in event handler
function handlePlaceCard(nextCard) {
  setCard(nextCard);
  if (nextCard.gold) {
    if (goldCardCount < 3) {
      setGoldCardCount(goldCardCount + 1);
    } else {
      setGoldCardCount(0);
      setRound(round + 1);
    }
  }
}
```

**Rule:** Calculate all next state in event handlers to avoid cascading renders.

### App Initialization

```typescript
// 🔴 Bad: Effects with logic that should only ever run once
useEffect(() => {
  loadDataFromLocalStorage();
  checkAuthToken();
}, []);

// ✅ Good: Top-level module code (runs once on import)
if (typeof window !== 'undefined') {
  checkAuthToken();
  loadDataFromLocalStorage();
}
```

**Rule:** Use top-level module code or `didInit` flag for one-time initialization.

### Notifying Parent Components

```typescript
// 🔴 Bad: The onChange handler runs too late
useEffect(() => {
  onChange(isOn);
}, [isOn, onChange]);

// ✅ Good: Perform all updates during the event
function updateToggle(nextIsOn) {
  setIsOn(nextIsOn);
  onChange(nextIsOn);
}
```

**Rule:** Call `onChange` in event handlers alongside state updates, not in Effects.

### Passing Data to Parent

```typescript
// 🔴 Bad: Passing data to the parent in an Effect
useEffect(() => {
  if (data) {
    onFetched(data);
  }
}, [onFetched, data]);

// ✅ Good: Parent fetches data, passes down as props
function Parent() {
  const data = useSomeAPI();
  return <Child data={data} />;
}
```

**Rule:** Lift data fetching up to parent, pass down as props.

### External Store Subscriptions

```typescript
// 🔴 Bad: Manual store subscription in an Effect
useEffect(() => {
  function updateState() {
    setIsOnline(navigator.onLine);
  }
  window.addEventListener('online', updateState);
  window.addEventListener('offline', updateState);
  return () => {
    window.removeEventListener('online', updateState);
    window.removeEventListener('offline', updateState);
  };
}, []);

// ✅ Good: Use useSyncExternalStore
function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

return useSyncExternalStore(
  subscribe,
  () => navigator.onLine,
  () => true
);
```

**Rule:** Use `useSyncExternalStore` for external store subscriptions.

### Data Fetching

```typescript
// 🔴 Bad: Fetching without cleanup logic
useEffect(() => {
  fetchResults(query, page).then(json => {
    setResults(json);
  });
}, [query, page]);

// ✅ Good: Fetching with cleanup to avoid race conditions
useEffect(() => {
  let ignore = false;
  fetchResults(query, page).then(json => {
    if (!ignore) {
      setResults(json);
    }
  });
  return () => {
    ignore = true;
  };
}, [query, page]);
```

**Rule:** If using Effects for data fetching, implement cleanup to avoid race conditions. Prefer framework built-in data fetching mechanisms.

### Summary

- If you can calculate something during render, you don't need an Effect.
- To cache expensive calculations, add `useMemo` instead of `useEffect`.
- To reset the state of an entire component tree, pass a different `key` to it.
- To reset a particular bit of state in response to a prop change, set it during rendering.
- Code that runs because a component was *displayed* should be in Effects, the rest should be in events.
- If you need to update the state of several components, it's better to do it during a single event.
- Whenever you try to synchronize state variables in different components, consider lifting state up.
- You can fetch data with Effects, but you need to implement cleanup to avoid race conditions.
