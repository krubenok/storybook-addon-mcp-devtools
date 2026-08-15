import { useState } from 'react';

export function Counter() {
  const [value, setValue] = useState(0);
  return (
    <button type="button" onClick={() => setValue((current) => current + 1)}>
      Local component count: {value}
    </button>
  );
}
