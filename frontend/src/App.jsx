import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Workspace from './layouts/Workspace';
import { Login, MessagePage } from './pages/AuthPages';
import { Overview, Profile } from './pages/Overview';
import { CreateUser, Users } from './pages/Users';
import Foundation from './pages/Foundation';

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/account-disabled" element={<MessagePage disabled />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/unauthorized" element={<MessagePage />} />
      <Route element={<Workspace />}>
        <Route index element={<Overview />} />
        <Route path="/profile" element={<Profile />} />
        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route path="/users" element={<Users />} />
          <Route path="/users/new" element={<CreateUser />} />
        </Route>
      </Route>
      <Route path="/foundation" element={<Foundation />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}
