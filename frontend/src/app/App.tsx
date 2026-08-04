import { RouterProvider } from "react-router";
import { AuthProvider } from "../context/AuthContext";
import { AppProvider } from "../context/AppContext";
import { router } from "./routes";
import { Toaster } from "sonner";

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-left" theme="dark" richColors />
      </AppProvider>
    </AuthProvider>
  );
}
