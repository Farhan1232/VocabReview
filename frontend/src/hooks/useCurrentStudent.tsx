/**
 * "Lesson with" student: the student the teacher is working with right now. Pages use it as the
 * default student. Remembered in localStorage as a per-browser convenience only.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

const KEY = 'lexis.currentStudent';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const Ctx = createContext<{ studentId: string | null; setStudentId: (id: string | null) => void }>({
  studentId: null,
  setStudentId: () => {},
});

/** Holds the student chosen for the current lesson. */
export function CurrentStudentProvider({ children }: { children: ReactNode }) {
  const [studentId, set] = useState<string | null>(read);
  const setStudentId = (id: string | null) => {
    set(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ studentId, setStudentId }}>{children}</Ctx.Provider>;
}

/** The lesson's student and a setter. */
export const useCurrentStudent = () => useContext(Ctx);
