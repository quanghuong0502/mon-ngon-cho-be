/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import OneSignal from "react-onesignal";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import { seedData } from "./seed";

export const initOneSignal = async () => {
    if (typeof window === "undefined") return;

    // Use a window flag to prevent multiple init calls in dev/strict mode
    if ((window as any)._oneSignalInitialized) return;

    try {
        await OneSignal.init({
            appId: import.meta.env.VITE_ONESIGNAL_APP_ID,
            safari_web_id: `web.onesignal.auto.${import.meta.env.VITE_ONESIGNAL_APP_ID}`,
            allowLocalhostAsSecureOrigin: true,
        });
        (window as any)._oneSignalInitialized = true;
        window.dispatchEvent(
            new CustomEvent("onesignal-ready", {
                detail: { oneSignal: OneSignal },
            }),
        );
    } catch (err: any) {
        if (err?.message?.includes("already initialized")) {
            (window as any)._oneSignalInitialized = true;
            window.dispatchEvent(
                new CustomEvent("onesignal-ready", {
                    detail: { oneSignal: OneSignal },
                }),
            );
            return;
        }
        console.error("OneSignal Init Error:", err);
    }
};

// Chef Pages
import AchievementManager from "./pages/chef/AchievementManager";
import ChefDashboard from "./pages/chef/Dashboard";
import MenuBuilder from "./pages/chef/MenuBuilder";
import NewsManager from "./pages/chef/NewsManager";
import OrderManager from "./pages/chef/OrderManager";
import RecipeEditor from "./pages/chef/RecipeEditor";
import RecipeList from "./pages/chef/RecipeList";
import ReviewHistory from "./pages/chef/ReviewHistory";
import ChefSettings from "./pages/chef/Settings";

// Kid Pages
import KidsFavorites from "./pages/kids/Favorites";
import KidsHome from "./pages/kids/Home";
import MyOrders from "./pages/kids/MyOrders";
import KidsOrder from "./pages/kids/Order";
import KidsProfile from "./pages/kids/Profile";

import { useAuth } from "./context/AuthContext";
import { FavoritesProvider } from "./context/FavoritesContext";
import { ThemeProvider } from "./context/ThemeContext";

function KidRoutes() {
    const { user } = useAuth();
    return (
        <FavoritesProvider userId={user?.userId}>
            <Routes>
                <Route
                    path="home"
                    element={
                        <Layout>
                            <KidsHome />
                        </Layout>
                    }
                />
                <Route
                    path="order"
                    element={
                        <Layout>
                            <KidsOrder />
                        </Layout>
                    }
                />
                <Route
                    path="my-orders"
                    element={
                        <Layout>
                            <MyOrders />
                        </Layout>
                    }
                />
                <Route
                    path="favorites"
                    element={
                        <Layout>
                            <KidsFavorites />
                        </Layout>
                    }
                />
                <Route
                    path="reviews"
                    element={
                        <Layout>
                            <MyOrders />
                        </Layout>
                    }
                />
                <Route
                    path="profile"
                    element={
                        <Layout>
                            <KidsProfile />
                        </Layout>
                    }
                />
                <Route path="*" element={<Navigate to="home" replace />} />
            </Routes>
        </FavoritesProvider>
    );
}

export default function App() {
    useEffect(() => {
        seedData();
        initOneSignal();
    }, []);

    return (
        <AuthProvider>
            <ThemeProvider>
                <BrowserRouter>
                    <Toaster
                        position="top-center"
                        toastOptions={{
                            duration: 3000,
                            style: {
                                borderRadius: "24px",
                                background: "var(--card)",
                                color: "var(--foreground)",
                                padding: "16px 24px",
                                fontSize: "14px",
                                fontWeight: "600",
                                boxShadow:
                                    "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                                border: "1px solid var(--border)",
                            },
                        }}
                    />
                    <Routes>
                        <Route path="/login" element={<Login />} />

                        {/* Chef Routes */}
                        <Route
                            element={<ProtectedRoute allowedRoles={["chef"]} />}
                        >
                            <Route
                                path="/chef"
                                element={
                                    <Layout
                                        children={
                                            <Navigate
                                                to="/chef/dashboard"
                                                replace
                                            />
                                        }
                                    />
                                }
                            />
                            <Route
                                path="/chef/dashboard"
                                element={
                                    <Layout>
                                        <ChefDashboard />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/recipes"
                                element={
                                    <Layout>
                                        <RecipeList />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/recipes/new"
                                element={
                                    <Layout>
                                        <RecipeEditor />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/recipes/:id"
                                element={
                                    <Layout>
                                        <RecipeEditor />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/menu"
                                element={
                                    <Layout>
                                        <MenuBuilder />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/orders"
                                element={
                                    <Layout>
                                        <OrderManager />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/news"
                                element={
                                    <Layout>
                                        <NewsManager />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/reviews"
                                element={
                                    <Layout>
                                        <ReviewHistory />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/achievements"
                                element={
                                    <Layout>
                                        <AchievementManager />
                                    </Layout>
                                }
                            />
                            <Route
                                path="/chef/settings"
                                element={
                                    <Layout>
                                        <ChefSettings />
                                    </Layout>
                                }
                            />
                        </Route>

                        {/* Kid Routes */}
                        <Route
                            element={<ProtectedRoute allowedRoles={["kid"]} />}
                        >
                            <Route path="/kids/*" element={<KidRoutes />} />
                        </Route>

                        <Route
                            path="/"
                            element={<Navigate to="/login" replace />}
                        />
                        <Route
                            path="*"
                            element={<Navigate to="/login" replace />}
                        />
                    </Routes>
                </BrowserRouter>
            </ThemeProvider>
        </AuthProvider>
    );
}
