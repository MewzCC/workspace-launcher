import { createContext } from 'react'

// Keep provider and consumers on the same context across component hot updates.
export const ConfirmDialogContext = createContext(null)
