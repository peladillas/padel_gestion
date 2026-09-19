import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('bp_theme');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light', cycleTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
