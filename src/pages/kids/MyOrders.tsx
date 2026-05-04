/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    CircleCheckBig,
    Image as ImageIcon,
    Loader2,
    MapPin,
    MessageSquare,
    Navigation,
    Sparkles,
    Star,
    Utensils,
    X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import BottomSheet from "../../components/BottomSheet";
import { useAuth } from "../../context/AuthContext";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { getOptimizedUrl, uploadToCloudinary } from "../../lib/cloudinary";
import { db } from "../../lib/firebase";
import { getChefOneSignalIds, sendPushToUser } from "../../lib/oneSignal";
import { Order, Recipe, Review, UserSession } from "../../types";

interface ReviewModalProps {
    recipe: Recipe;
    orderId: string;
    orderDate: Date;
    orderDay: string;
    user: UserSession;
    existingReview?: Review;
    onClose: () => void;
    onSuccess: () => void;
}

function ReviewModal({
    recipe,
    orderId,
    orderDate,
    orderDay,
    user,
    existingReview,
    onClose,
    onSuccess,
}: ReviewModalProps) {
    const [rating, setRating] = useState(existingReview?.rating || 0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState(existingReview?.comment || "");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [images, setImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>(
        existingReview?.imageUrls || [],
    );
    const [submitting, setSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useLockBodyScroll(true);

    const isReadOnly = !!existingReview;

    const ratingLabels: Record<number, string> = {
        1: "Không ngon",
        2: "Tạm được",
        3: "Khá ngon",
        4: "Rất ngon",
        5: "Tuyệt vời!",
    };

    const getTagsByRating = (r: number) => {
        const custom = recipe.reviewTags;

        // Find a matching rule based on exact star rating
        if (custom && Array.isArray(custom)) {
            const match = custom.find((rule) => r === rule.star);
            if (match && match.tags.length > 0) return match.tags;
        }

        // Default fallbacks if no custom rule matches
        if (r === 5)
            return [
                "Ngon tuyệt! 😋",
                "Rất thích! ❤️",
                "Trang trí đẹp",
                "Nhiều đồ ăn",
            ];
        if (r >= 3) return ["Khá ngon", "Bình thường", "Hơi mặn", "Hơi cay"];
        if (r >= 1) return ["Không ngon", "Ít đồ ăn", "Quá mặn", "Quá cay"];
        return [];
    };

    const suggestions = getTagsByRating(rating);

    // Synchronize selected tags with comment text whenever either changes
    useEffect(() => {
        if (isReadOnly) return;
        const activeTags = suggestions.filter((tag) => comment.includes(tag));
        setSelectedTags(activeTags);
    }, [comment, suggestions, isReadOnly]);

    const handleTagClick = (tag: string) => {
        if (isReadOnly) return;

        const isSelected = selectedTags.includes(tag);

        if (isSelected) {
            setComment((prev) => {
                const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                // Handle removing the tag and punctuation correctly
                let newComment = prev;
                // Try removing with leading comma
                newComment = newComment.replace(
                    new RegExp(`,\\s*${escapedTag}`, "g"),
                    "",
                );
                // Try removing with trailing comma
                newComment = newComment.replace(
                    new RegExp(`${escapedTag},\\s*`, "g"),
                    "",
                );
                // Try removing exact match
                newComment = newComment.replace(
                    new RegExp(`^${escapedTag}$`, "g"),
                    "",
                );
                return newComment.trim();
            });
        } else {
            // Auto-append logic with comma
            setComment((prev) => {
                const trimmed = prev.trim();
                if (!trimmed) return tag;
                return `${trimmed}, ${tag}`;
            });
        }

        // Auto-expand textarea
        if (textareaRef.current) {
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.style.height = "auto";
                    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
                }
            }, 0);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            const totalCount = images.length + newFiles.length;

            if (totalCount > 3) {
                toast.error("Bé chỉ được thêm tối đa 3 ảnh thôi nhé!");
                return;
            }

            setImages((prev) => [...prev, ...newFiles]);
            const newPreviews = newFiles.map((file: File) =>
                URL.createObjectURL(file),
            );
            setPreviews((prev) => [...prev, ...newPreviews]);
        }
    };

    const removeImage = (index: number) => {
        URL.revokeObjectURL(previews[index]);
        setImages((prev) => prev.filter((_, i) => i !== index));
        setPreviews((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || rating === 0 || !comment.trim()) return;

        setSubmitting(true);
        const toastId = toast.loading("Đang gửi đánh giá...");

        try {
            const imageUrls: string[] = [];

            if (images.length > 0) {
                try {
                    for (let i = 0; i < images.length; i++) {
                        const url = await uploadToCloudinary(
                            images[i],
                            "buacomchobe/reviews",
                        );
                        imageUrls.push(url);
                    }
                } catch (err: any) {
                    console.error("Cloudinary Upload Error:", err);
                }
            }

            await addDoc(collection(db, "reviews"), {
                recipeId: recipe.id,
                orderId,
                authorId: user.userId,
                authorName: user.name,
                authorAvatar: user.avatar || null,
                authorRole: user.role,
                rating,
                comment,
                imageUrls,
                createdAt: Timestamp.now(),
            });

            const recipeRef = doc(db, "recipes", recipe.id!);
            const recipeDoc = await getDoc(recipeRef);
            if (recipeDoc.exists()) {
                const data = recipeDoc.data();
                const currentTotal = data.totalRatings || 0;
                const currentAvg = data.avgRating || 0;
                const newTotal = currentTotal + 1;
                const newAvg = (currentAvg * currentTotal + rating) / newTotal;

                await updateDoc(recipeRef, {
                    totalRatings: newTotal,
                    avgRating: newAvg,
                });
            }

            toast.success("Cảm ơn bé đã đánh giá nhé!", { id: toastId });
            setIsSuccess(true);

            try {
                const chefIds = await getChefOneSignalIds();
                if (chefIds.length > 0) {
                    const starsLabel = `${rating} sao`;
                    const shortComment = comment
                        ? comment.length > 80
                            ? comment.substring(0, 77) + "..."
                            : comment
                        : "Không có bình luận";

                    await sendPushToUser(
                        chefIds,
                        `Bé ${user.name || ""} đã đánh giá món ăn! ${starsLabel}`,
                        `"${shortComment}" — món ${recipe.title}`,
                        "/chef/reviews",
                    );
                }
            } catch (err) {
                console.error("Notify chef error:", err);
            }

            setTimeout(() => {
                onSuccess();
            }, 2000);
        } catch (err) {
            console.error("Error submitting review:", err);
            toast.error("Có lỗi xảy ra, bé thử lại sau nhé!", { id: toastId });
        } finally {
            setSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <BottomSheet isOpen={true} onClose={onSuccess}>
                <div className="py-12 text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.2, 1], rotate: [0, 10, 0] }}
                        className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mx-auto mb-6"
                    >
                        <Sparkles size={48} />
                    </motion.div>
                    <h2 className="text-2xl font-black text-foreground mb-2">
                        Tuyệt vời!
                    </h2>
                    <p className="text-muted-foreground font-medium px-4">
                        Cảm ơn bé đã gửi đánh giá cho đầu bếp nhé! Bé thật ngoan
                    </p>
                </div>
            </BottomSheet>
        );
    }

    const Header = (
        <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary shadow-sm border border-primary/10">
                <MessageSquare size={20} />
            </div>
            <div>
                <h2 className="text-[17px] font-black text-foreground leading-tight">
                    {isReadOnly ? "Đánh giá món" : "Bé thấy món thế nào?"}
                </h2>
                <div className="flex flex-col mt-0.5">
                    <p className="text-[14px] font-black text-primary leading-tight">
                        {recipe.title}
                    </p>
                    <p className="text-[12px] font-medium text-muted-foreground mt-0.5">
                        {orderDay}, {format(orderDate, "dd/MM")}
                    </p>
                </div>
            </div>
        </div>
    );

    const Footer = (
        <div className="w-full">
            {isReadOnly ? (
                <button
                    onClick={onClose}
                    className="w-full h-12 bg-secondary text-muted-foreground font-black rounded-[14px] hover:opacity-80 transition-all uppercase tracking-widest text-[13px] active:scale-[0.98]"
                >
                    Đóng
                </button>
            ) : (
                <button
                    form="review-form"
                    type="submit"
                    disabled={submitting || rating === 0 || !comment.trim()}
                    className={`w-full h-12 rounded-[14px] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-[0.98] ${
                        rating === 0 || !comment.trim()
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-primary text-primary-foreground shadow-primary-shadow/30 hover:opacity-95"
                    }`}
                >
                    {submitting ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            Đang gửi...
                        </>
                    ) : (
                        <>Gửi đánh giá cho Đầu bếp 🍱</>
                    )}
                </button>
            )}
        </div>
    );

    return (
        <BottomSheet
            isOpen={true}
            onClose={onClose}
            title={Header}
            footer={Footer}
        >
            <div className="space-y-4 px-6 md:px-8 py-6">
                {/* Rating Section */}
                <div className="text-center">
                    <div className="flex justify-center gap-2 pb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <motion.button
                                key={star}
                                type="button"
                                disabled={isReadOnly}
                                onMouseEnter={() =>
                                    !isReadOnly && setHoverRating(star)
                                }
                                onMouseLeave={() =>
                                    !isReadOnly && setHoverRating(0)
                                }
                                onClick={() => setRating(star)}
                                whileHover={
                                    !isReadOnly
                                        ? { scale: 1.15, rotate: [0, -5, 5, 0] }
                                        : {}
                                }
                                whileTap={!isReadOnly ? { scale: 0.95 } : {}}
                                className="relative p-0.5"
                            >
                                <Star
                                    size={32}
                                    className={`transition-colors duration-200 ${
                                        star <= (hoverRating || rating)
                                            ? "text-primary fill-primary"
                                            : "text-border fill-muted/20"
                                    }`}
                                    strokeWidth={
                                        star <= (hoverRating || rating)
                                            ? 2
                                            : 1.5
                                    }
                                />
                            </motion.button>
                        ))}
                    </div>
                    <AnimatePresence mode="wait">
                        {(hoverRating || rating) > 0 && (
                            <motion.p
                                key={hoverRating || rating}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="text-[13px] font-black text-primary"
                            >
                                {ratingLabels[hoverRating || rating]}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                {/* Input & Upload Sections */}
                <form
                    id="review-form"
                    onSubmit={handleSubmit}
                    className="space-y-4"
                >
                    {isReadOnly ? (
                        <div className="space-y-4 text-left">
                            {previews.length > 0 && (
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block mb-2">
                                        Ảnh của bé
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {previews.map((preview, i) => (
                                            <div
                                                key={i}
                                                className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-sm border border-border"
                                            >
                                                <img
                                                    src={getOptimizedUrl(
                                                        preview,
                                                        300,
                                                    )}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {comment && (
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block mb-2">
                                        Cảm nhận của bé
                                    </label>
                                    <div className="w-full p-4 bg-secondary border border-border rounded-2xl text-foreground text-[14px] leading-relaxed italic">
                                        "{comment}"
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Upload Section */}
                            <div className="text-left space-y-3">
                                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block">
                                    {images.length > 0
                                        ? "Ảnh của bé"
                                        : "Thêm ảnh"}
                                </label>
                                <div className="flex flex-wrap gap-3">
                                    {previews.map((preview, i) => (
                                        <div
                                            key={i}
                                            className="relative w-16 h-16 rounded-xl overflow-hidden bg-secondary border border-border"
                                        >
                                            <img
                                                src={preview}
                                                className="w-full h-full object-cover"
                                            />
                                            <motion.button
                                                type="button"
                                                onClick={() => removeImage(i)}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg"
                                            >
                                                <X size={10} />
                                            </motion.button>
                                        </div>
                                    ))}

                                    {images.length < 3 && (
                                        <label className="w-16 h-16 rounded-xl border-2 border-dashed border-primary/30 bg-secondary flex flex-col items-center justify-center gap-1 text-primary hover:border-primary hover:bg-secondary transition-all cursor-pointer group">
                                            <ImageIcon size={20} />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={handleImageChange}
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Comment Section */}
                            <div className="space-y-3 text-left">
                                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1.5 block">
                                    Cảm nhận{" "}
                                    <span className="text-destructive">*</span>
                                </label>
                                <textarea
                                    ref={textareaRef}
                                    value={comment}
                                    onChange={(e) => {
                                        setComment(e.target.value);
                                        e.target.style.height = "auto";
                                        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                                    }}
                                    placeholder="Món này ngon quá ạ! Bé rất thích..."
                                    className="w-full p-4 bg-secondary border border-border rounded-[20px] outline-none focus:border-primary transition-all min-h-[100px] max-h-[160px] resize-none text-foreground leading-relaxed text-based w-full p-3 leading-snug text-base"
                                />
                            </div>

                            {/* Quick Tags */}
                            {rating > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[13px] font-medium text-muted-foreground ml-1.5 block">
                                        Chọn nhanh 👇
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {suggestions.map((s) => {
                                            const isSelected =
                                                selectedTags.includes(s);
                                            return (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() =>
                                                        handleTagClick(s)
                                                    }
                                                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-all active:scale-95 border ${
                                                        isSelected
                                                            ? "bg-primary border-primary text-primary-foreground cursor-pointer shadow-none"
                                                            : "bg-white border-gray-200 text-gray-700 hover:border-primary hover:text-primary cursor-pointer shadow-sm"
                                                    }`}
                                                >
                                                    {isSelected ? `✓ ${s}` : s}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </form>
            </div>
        </BottomSheet>
    );
}

export default function MyOrders() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isReviewsPage = location.pathname === "/kids/reviews";
    const [orders, setOrders] = useState<Order[]>([]);
    const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
    const [reviews, setReviews] = useState<Record<string, Review>>({});
    const [loading, setLoading] = useState(true);
    const [kitchenConfig, setKitchenConfig] = useState<any>(null);
    const [isKitchenOpen, setIsKitchenOpen] = useState(false);
    const [reviewingMeal, setReviewingMeal] = useState<{
        recipe: Recipe;
        orderId: string;
        orderDate: Date;
        orderDay: string;
    } | null>(null);
    const [selectedImages, setSelectedImages] = useState<string[] | null>(null);
    const [weekIdx, setWeekIdx] = useState(0);
    const [reviewFilter, setReviewFilter] = useState<
        "all" | "unreviewed" | "reviewed"
    >("all");

    useLockBodyScroll(!!reviewingMeal || !!selectedImages);

    useEffect(() => {
        if (!user) return;

        // Snapshot for kitchen config
        const unsubscribeKitchen = onSnapshot(
            doc(db, "config", "main"),
            (snap) => {
                if (snap.exists()) {
                    setKitchenConfig(snap.data());
                }
            },
        );

        return () => unsubscribeKitchen();
    }, [user]);

    useEffect(() => {
        const checkKitchenStatus = () => {
            if (!kitchenConfig) {
                setIsKitchenOpen(false);
                return;
            }
            const { openTime, closeTime } = kitchenConfig;
            if (!openTime || !closeTime) {
                setIsKitchenOpen(false);
                return;
            }

            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            const [openH, openM] = openTime.split(":").map(Number);
            const [closeH, closeM] = closeTime.split(":").map(Number);
            const openMinutes = openH * 60 + openM;
            const closeMinutes = closeH * 60 + closeM;

            setIsKitchenOpen(
                currentMinutes >= openMinutes && currentMinutes <= closeMinutes,
            );
        };

        checkKitchenStatus();
        const timer = setInterval(checkKitchenStatus, 60000);
        return () => clearInterval(timer);
    }, [kitchenConfig]);

    const updateOrderStatus = async (orderId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, "orders", orderId), {
                status: newStatus,
                updatedAt: new Date(),
            });

            // Notify chef
            const order = orders.find((o) => o.id === orderId);
            if (order) {
                const recipe = recipes[order.recipeId];
                const kidName = user?.name || "Bé";
                const recipeName = recipe?.title || "món ăn";

                const messages: Record<
                    string,
                    { title: string; body: string }
                > = {
                    on_the_way: {
                        title: `Bé ${kidName} đang trên đường!`,
                        body: `Bé đang đến lấy món ${recipeName}. Chuẩn bị nhé!`,
                    },
                    arrived: {
                        title: `Bé ${kidName} đã tới bếp!`,
                        body: `Bé đang chờ nhận món ${recipeName}. Giao món thôi!`,
                    },
                };

                const msg = messages[newStatus];
                if (msg) {
                    const chefIds = await getChefOneSignalIds();
                    if (chefIds.length > 0) {
                        await sendPushToUser(
                            chefIds,
                            msg.title,
                            msg.body,
                            "/chef/orders",
                        );
                    }
                }
            }
        } catch (err) {
            console.error("Error updating order status:", err);
        }
    };

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);

        // 1. Snapshot for all orders of this user
        const q = query(
            collection(db, "orders"),
            where("kidId", "==", user.userId),
            orderBy("createdAt", "desc"),
        );

        const unsubscribe = onSnapshot(
            q,
            async (snap) => {
                const loadedOrders = snap.docs.map(
                    (d) => ({ id: d.id, ...d.data() }) as Order,
                );
                setOrders(loadedOrders);

                // 2. Fetch recipes for these orders
                const allIds = Array.from(
                    new Set(loadedOrders.map((o) => o.recipeId)),
                ).filter(Boolean) as string[];
                const recipeMap: Record<string, Recipe> = { ...recipes };

                await Promise.all(
                    allIds.map(async (id) => {
                        if (!recipeMap[id]) {
                            const rDoc = await getDoc(doc(db, "recipes", id));
                            if (rDoc.exists())
                                recipeMap[id] = {
                                    id: rDoc.id,
                                    ...rDoc.data(),
                                } as Recipe;
                        }
                    }),
                );

                setRecipes(recipeMap);
                setLoading(false);
            },
            (err) => {
                console.error("MyOrders snapshot error:", err);
                setLoading(false);
            },
        );

        // 3. Snapshot for reviews of this user's orders
        const reviewsQuery = query(
            collection(db, "reviews"),
            where("authorId", "==", user.userId),
        );

        const unsubscribeReviews = onSnapshot(
            reviewsQuery,
            (snap) => {
                const reviewMap: Record<string, Review> = {};
                snap.docs.forEach((doc) => {
                    const data = doc.data() as Review;
                    if (data.orderId)
                        reviewMap[data.orderId] = { id: doc.id, ...data };
                });
                setReviews(reviewMap);
            },
            (err) => {
                console.error("Reviews snapshot error:", err);
            },
        );

        return () => {
            unsubscribe();
            unsubscribeReviews();
        };
    }, [user]);

    // Group orders by weekId
    const weeks = (
        Array.from(new Set(orders.map((o) => o.weekId))) as string[]
    ).sort((a, b) => b.localeCompare(a));

    const getStatusDisplay = (status: Order["status"]) => {
        switch (status) {
            case "pending":
                return {
                    icon: (
                        <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="w-2 h-2 rounded-full bg-muted-foreground/50"
                        />
                    ),
                    label: "Đang chờ",
                    color: "text-muted-foreground bg-secondary",
                };
            case "preparing":
                return {
                    icon: (
                        <Loader2
                            className="animate-spin text-primary"
                            size={12}
                        />
                    ),
                    label: "Đang làm",
                    color: "text-primary bg-primary/10",
                };
            case "ready":
                return {
                    icon: (
                        <motion.div
                            animate={{ y: [0, -2, 0] }}
                            transition={{ repeat: Infinity, duration: 0.6 }}
                        >
                            <CircleCheckBig
                                className="text-green-500"
                                size={14}
                            />
                        </motion.div>
                    ),
                    label: "Sẵn sàng!",
                    color: "text-green-600 bg-green-500/10 font-black",
                };
            case "on_the_way":
                return {
                    icon: (
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    ),
                    label: "Đang đến",
                    color: "text-blue-600 bg-blue-50",
                };
            case "arrived":
                return {
                    icon: (
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    ),
                    label: "Đã đến",
                    color: "text-indigo-600 bg-indigo-50",
                };
            case "done":
                return {
                    icon: (
                        <CircleCheckBig
                            className="text-muted-foreground/30"
                            size={12}
                        />
                    ),
                    label: "Hoàn thành",
                    color: "text-muted-foreground bg-secondary",
                };
            case "cancelled":
                return {
                    icon: (
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                    ),
                    label: "Đã huỷ",
                    color: "text-muted-foreground bg-secondary opacity-60",
                };
            default:
                return {
                    icon: (
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                    ),
                    label: String(status),
                    color: "text-muted-foreground bg-secondary",
                };
        }
    };

    if (loading)
        return (
            <div className="p-20 text-center">
                <Loader2
                    className="animate-spin mx-auto text-primary"
                    size={48}
                />
            </div>
        );

    const currentWeekId = weeks[weekIdx];
    let weekOrders = orders.filter((o) => o.weekId === currentWeekId);

    // Filter logic for reviews page
    if (isReviewsPage) {
        weekOrders = weekOrders.filter((o) => o.status === "done");

        if (reviewFilter === "unreviewed") {
            weekOrders = weekOrders.filter((o) => !reviews[o.id!]);
        } else if (reviewFilter === "reviewed") {
            weekOrders = weekOrders.filter((o) => !!reviews[o.id!]);
        }
    }

    const weekNumber =
        currentWeekId?.split("-W")[1] ||
        (currentWeekId as string)?.split("-")[1];

    return (
        <div className="h-full overflow-y-auto scrollbar-hide kid-page-content">
            <div className="max-w-[680px] mx-auto space-y-[2px]">
                <h1 className="text-[20px] font-semibold text-foreground">
                    {isReviewsPage ? "Lịch sử đánh giá" : "Món Bé đã đặt"}
                </h1>
                <p className="text-[13px] font-normal text-muted-foreground">
                    {isReviewsPage
                        ? "Xem lại những nhận xét của bé về các món ăn"
                        : "Hành trình khám phá ẩm thực của bé mỗi ngày"}
                </p>
            </div>

            <div className="max-w-[680px] mx-auto pb-20">
                {/* Week Selector - Sticky */}
                {weeks.length > 0 && (
                    <div className="sticky top-0 z-[28] bg-background pb-6 pt-6">
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={() =>
                                        setWeekIdx((prev) =>
                                            Math.min(
                                                weeks.length - 1,
                                                prev + 1,
                                            ),
                                        )
                                    }
                                    disabled={weekIdx === weeks.length - 1}
                                    className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
                                >
                                    <ChevronLeft size={20} />
                                </button>

                                <div className="flex items-center gap-2 bg-card px-6 py-2.5 rounded-xl shadow-sm border border-border font-black text-xs text-primary">
                                    <Calendar size={16} />
                                    <span className="uppercase tracking-widest">
                                        TUẦN {weekNumber}
                                    </span>
                                </div>

                                <button
                                    onClick={() =>
                                        setWeekIdx((prev) =>
                                            Math.max(0, prev - 1),
                                        )
                                    }
                                    disabled={weekIdx === 0}
                                    className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>

                            {isReviewsPage && (
                                <div className="flex bg-secondary p-1 rounded-2xl max-w-sm mx-auto w-full">
                                    {(
                                        [
                                            "all",
                                            "unreviewed",
                                            "reviewed",
                                        ] as const
                                    ).map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setReviewFilter(f)}
                                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                                                reviewFilter === f
                                                    ? "bg-card text-primary shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            {f === "all" && "Tất cả"}
                                            {f === "unreviewed" &&
                                                "Chưa đánh giá"}
                                            {f === "reviewed" && "Đã đánh giá"}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-transparent to-background pointer-events-none translate-y-full" />
                    </div>
                )}

                {weekOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-[32px] border border-border shadow-sm px-6">
                        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-6 text-muted-foreground/30">
                            {isReviewsPage ? (
                                <Star size={40} />
                            ) : (
                                <Utensils size={40} />
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-foreground">
                            {isReviewsPage
                                ? "Chưa có món nào hoàn thành trong tuần này"
                                : "Bé chưa đặt món nào tuần này"}
                        </h3>
                        <p className="text-muted-foreground mt-1 mb-8 text-sm">
                            {isReviewsPage
                                ? "Chỉ món đã hoàn thành mới có thể đánh giá nhé!"
                                : "Qua trang Đặt món để chọn nhé!"}
                        </p>
                        {!isReviewsPage && (
                            <button
                                onClick={() => navigate("/kids/order")}
                                className="px-8 py-3.5 rounded-2xl border-2 border-primary text-primary font-bold hover:bg-primary hover:text-primary-foreground transition-all text-sm"
                            >
                                Đặt món ngay
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 mt-3">
                        <div className="space-y-5">
                            {weekOrders.map((order) => {
                                const recipe = recipes[order.recipeId];
                                const statusInfo = getStatusDisplay(
                                    order.status,
                                );
                                const dayLabel = {
                                    mon: "Thứ Hai",
                                    tue: "Thứ Ba",
                                    wed: "Thứ Tư",
                                    thu: "Thứ Năm",
                                    fri: "Thứ Sáu",
                                }[order.day];
                                const review = reviews[order.id!];
                                const hasReview = !!review;
                                const isActive = [
                                    "ready",
                                    "on_the_way",
                                    "arrived",
                                ].includes(order.status);

                                return (
                                    <motion.div
                                        key={order.id}
                                        layout
                                        className={`bg-card rounded-[32px] border p-4 md:p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden ${
                                            isActive
                                                ? "border-primary border-2"
                                                : "border-border"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                                                {dayLabel}
                                            </span>
                                            {!isReviewsPage && (
                                                <div
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${statusInfo.color}`}
                                                >
                                                    {statusInfo.icon}
                                                    <span
                                                        className={`text-[10px] font-black uppercase tracking-wider ${order.status === "cancelled" ? "line-through" : ""}`}
                                                    >
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                            )}
                                            {isReviewsPage && hasReview && (
                                                <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-xl text-primary font-black text-[10px] uppercase tracking-wider">
                                                    <Star
                                                        size={12}
                                                        className="fill-current"
                                                    />
                                                    Đã đánh giá
                                                </div>
                                            )}
                                            {isReviewsPage && !hasReview && (
                                                <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-xl text-muted-foreground font-black text-[10px] uppercase tracking-wider">
                                                    <Star
                                                        size={12}
                                                        className="fill-current"
                                                    />
                                                    Chưa đánh giá
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-5 mb-5">
                                            <div
                                                className={`w-20 h-20 rounded-2xl overflow-hidden bg-secondary flex-shrink-0 border border-border ${order.status === "cancelled" ? "grayscale opacity-50" : ""}`}
                                            >
                                                {recipe?.imageUrl ? (
                                                    <img
                                                        src={getOptimizedUrl(
                                                            recipe.imageUrl,
                                                            200,
                                                        )}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/50">
                                                        <Utensils size={28} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col justify-center min-w-0 flex-1">
                                                <h4
                                                    className={`font-medium text-foreground text-base mb-1 truncate leading-tight ${order.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}
                                                >
                                                    {recipe?.title ||
                                                        "Đang tải..."}
                                                </h4>
                                                <p className="text-[12px] text-muted-foreground mb-2">
                                                    {format(
                                                        order.createdAt.toDate(),
                                                        "HH:mm - dd/MM",
                                                        { locale: vi },
                                                    )}
                                                </p>

                                                {isReviewsPage && (
                                                    <div className="flex items-center gap-1">
                                                        {[1, 2, 3, 4, 5].map(
                                                            (star) => (
                                                                <Star
                                                                    key={star}
                                                                    size={16}
                                                                    className={
                                                                        star <=
                                                                        (review?.rating ||
                                                                            0)
                                                                            ? "text-primary fill-primary"
                                                                            : "text-muted/20 fill-muted/5"
                                                                    }
                                                                />
                                                            ),
                                                        )}
                                                        {hasReview && (
                                                            <span className="ml-2 text-sm font-bold text-primary">
                                                                {review.rating}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {isActive && (
                                            <div className="mb-1 space-y-4">
                                                <div className="h-px bg-border w-full" />

                                                {/* 3. Thông tin bếp */}
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <div
                                                            className={`w-2 h-2 rounded-full ${isKitchenOpen ? "bg-green-500 pulse" : "bg-muted-foreground/20"}`}
                                                        />
                                                        <span
                                                            className={`text-[12px] font-bold ${isKitchenOpen ? "text-green-600" : "text-muted-foreground"}`}
                                                        >
                                                            {isKitchenOpen
                                                                ? "Bếp đang mở"
                                                                : "Bếp đã đóng"}
                                                        </span>
                                                        <span className="text-border">
                                                            ·
                                                        </span>
                                                        <span className="text-[12px] font-medium text-muted-foreground">
                                                            Giờ phục vụ:{" "}
                                                            {
                                                                kitchenConfig?.openTime
                                                            }{" "}
                                                            –{" "}
                                                            {
                                                                kitchenConfig?.closeTime
                                                            }
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    {/* 4. Nút CTA cam */}
                                                    {order.status ===
                                                        "ready" && (
                                                        <button
                                                            disabled={
                                                                !isKitchenOpen
                                                            }
                                                            onClick={() =>
                                                                updateOrderStatus(
                                                                    order.id!,
                                                                    "on_the_way",
                                                                )
                                                            }
                                                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 ${
                                                                isKitchenOpen
                                                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary-shadow/30 hover:scale-[1.01] active:scale-[0.98]"
                                                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                                                            }`}
                                                        >
                                                            <Navigation
                                                                size={16}
                                                            />
                                                            Bé đang đến lấy!
                                                        </button>
                                                    )}

                                                    {order.status ===
                                                        "on_the_way" && (
                                                        <button
                                                            disabled={
                                                                !isKitchenOpen
                                                            }
                                                            onClick={() =>
                                                                updateOrderStatus(
                                                                    order.id!,
                                                                    "arrived",
                                                                )
                                                            }
                                                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 ${
                                                                isKitchenOpen
                                                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary-shadow/30 hover:scale-[1.01] active:scale-[0.98]"
                                                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                                                            }`}
                                                        >
                                                            <MapPin size={16} />
                                                            Bé đã tới bếp!
                                                        </button>
                                                    )}

                                                    {/* 5. Link phụ */}
                                                    {kitchenConfig?.mapsShareLink && (
                                                        <button
                                                            onClick={() =>
                                                                window.open(
                                                                    kitchenConfig.mapsShareLink,
                                                                    "_blank",
                                                                )
                                                            }
                                                            className="text-primary font-bold text-xs flex items-center justify-center gap-2 hover:underline py-1"
                                                        >
                                                            <Navigation
                                                                size={14}
                                                            />
                                                            Xem đường đến bếp
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {isReviewsPage &&
                                            hasReview &&
                                            review.comment && (
                                                <div className="mb-5 p-4 bg-primary/5 rounded-2xl text-[13px] text-foreground/80 font-medium italic border border-primary/10">
                                                    "{review.comment}"
                                                </div>
                                            )}

                                        {(order.status === "done" ||
                                            isReviewsPage) &&
                                            recipe && (
                                                <button
                                                    onClick={() =>
                                                        setReviewingMeal({
                                                            recipe,
                                                            orderId: order.id!,
                                                            orderDate:
                                                                order.createdAt.toDate(),
                                                            orderDay: dayLabel,
                                                        })
                                                    }
                                                    className={`w-full h-12 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                                                        hasReview
                                                            ? "border-border text-muted-foreground hover:bg-secondary"
                                                            : "border-primary text-primary hover:bg-primary hover:text-primary-foreground shadow-lg shadow-primary-shadow/30"
                                                    }`}
                                                >
                                                    {hasReview ? (
                                                        "Xem lại đánh giá"
                                                    ) : (
                                                        <>
                                                            <Star
                                                                size={14}
                                                                className="fill-current"
                                                            />
                                                            Đánh giá ngay
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Photo View Modal */}
            <AnimatePresence>
                {selectedImages && (
                    <div
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
                        onClick={() => setSelectedImages(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-full max-w-4xl flex flex-col gap-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedImages(null)}
                                className="modal-close-btn"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {selectedImages.map((url, i) => (
                                    <div
                                        key={i}
                                        className="aspect-square rounded-3xl overflow-hidden shadow-2xl border-4 border-card"
                                    >
                                        <img
                                            src={getOptimizedUrl(url, 600)}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Review Modal */}
            <AnimatePresence>
                {reviewingMeal && (
                    <ReviewModal
                        recipe={reviewingMeal.recipe}
                        orderId={reviewingMeal.orderId}
                        orderDate={reviewingMeal.orderDate}
                        orderDay={reviewingMeal.orderDay}
                        user={user!}
                        existingReview={reviews[reviewingMeal.orderId]}
                        onClose={() => setReviewingMeal(null)}
                        onSuccess={() => setReviewingMeal(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
