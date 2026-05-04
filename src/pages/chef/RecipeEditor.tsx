/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    addDoc,
    collection,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import {
    AlertTriangle,
    ArrowLeft,
    Loader2,
    Plus,
    Save,
    Star,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../../components/ConfirmModal";
import { getSession } from "../../lib/auth";
import { getOptimizedUrl, uploadToCloudinary } from "../../lib/cloudinary";
import { db } from "../../lib/firebase";
import { getAllKidOneSignalIds, sendPushToUser } from "../../lib/oneSignal";
import { Recipe } from "../../types";

interface Ingredient {
    amount: string;
    unit: string;
    name: string;
}

export default function RecipeEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const session = getSession();
    const isNew = !id || id === "new";

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [initialPublished, setInitialPublished] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const isInitialMount = useRef(true);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [ingredients, setIngredients] = useState<Ingredient[]>([
        { amount: "", unit: "", name: "" },
    ]);
    const [steps, setSteps] = useState<string[]>([""]);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [reviewTags, setReviewTags] = useState<
        { star: number; tags: string[] }[]
    >([]);
    const [rtInput, setRtInput] = useState<string[]>([]); // Inputs per rule
    const [isPublished, setIsPublished] = useState(false);
    const [imageUrl, setImageUrl] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState("");
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    const autoSaveTimer = useRef<any>(null);

    useEffect(() => {
        if (isNew) {
            isInitialMount.current = false;
        }
        if (!isNew) {
            fetchRecipe();
        }

        return () => {
            if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
        };
    }, [id]);

    // Record changes to trigger dirty state
    useEffect(() => {
        if (!loading && !isInitialMount.current) {
            setIsDirty(true);
        }
    }, [
        title,
        description,
        ingredients,
        steps,
        tags,
        reviewTags,
        isPublished,
        imageFile,
    ]);

    // Auto-save logic
    useEffect(() => {
        if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);

        if (!isNew && title) {
            autoSaveTimer.current = setInterval(() => {
                handleSave(true);
            }, 30000); // 30 seconds
        }
    }, [
        title,
        description,
        ingredients,
        steps,
        tags,
        reviewTags,
        isPublished,
        imageUrl,
    ]);

    const fetchRecipe = async () => {
        try {
            const docRef = doc(db, "recipes", id!);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as Recipe;
                setTitle(data.title);
                setDescription(data.description);
                setIngredients(
                    data.ingredients.map((item) => {
                        const parts = item.split(" ");
                        return {
                            amount: parts[0] || "",
                            unit: parts[1] || "",
                            name: parts.slice(2).join(" ") || "",
                        };
                    }),
                );
                setSteps(data.steps);
                setTags(data.tags || []);
                const tags = Array.isArray(data.reviewTags)
                    ? data.reviewTags
                    : [];
                setReviewTags(tags);
                setRtInput(new Array(tags.length).fill(""));
                setIsPublished(data.isPublished || false);
                setInitialPublished(data.isPublished || false);
                setImageUrl(data.imageUrl || "");
                setImagePreview(data.imageUrl || "");
                // Reset mount ref after data is loaded to allow dirty tracking
                setTimeout(() => {
                    isInitialMount.current = false;
                    setIsDirty(false);
                }, 100);
            }
        } catch (error) {
            console.error("Error fetching recipe:", error);
            toast.error("Không thể tải công thức");
        } finally {
            setLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
            setIsDirty(true);
        }
    };

    const handleBack = () => {
        if (isDirty) {
            setShowLeaveConfirm(true);
        } else {
            navigate("/chef/recipes");
        }
    };

    const handleSave = async (isAuto = false) => {
        if (!title) return;
        if (!isAuto) setSaving(true);

        try {
            let finalImageUrl = imageUrl;
            if (imageFile) {
                setUploadingImage(true);
                try {
                    finalImageUrl = await uploadToCloudinary(
                        imageFile,
                        "buacomchobe/recipes",
                    );
                    setImageUrl(finalImageUrl);
                    setImageFile(null);
                } catch (err) {
                    throw new Error(
                        "Tải ảnh thất bại: " +
                            (err instanceof Error
                                ? err.message
                                : "Lỗi không xác định"),
                    );
                } finally {
                    setUploadingImage(false);
                }
            }

            const formattedIngredients = ingredients
                .filter((i) => i.name.trim())
                .map((i) => `${i.amount} ${i.unit} ${i.name}`.trim());

            const recipeData: any = {
                title,
                description,
                ingredients: formattedIngredients,
                steps: steps.filter((s) => s.trim()),
                tags,
                reviewTags,
                imageUrl: finalImageUrl,
                isPublished,
                updatedAt: serverTimestamp(),
                createdBy: session?.userId,
            };

            if (isNew) {
                recipeData.avgRating = 0;
                recipeData.totalRatings = 0;
                recipeData.createdAt = serverTimestamp();
            }

            if (isNew) {
                const newRef = doc(collection(db, "recipes"));
                await setDoc(newRef, recipeData);

                // Auto-create news if published immediately
                if (isPublished) {
                    const newsTitle = `Món mới cập bến: ${title}!`;
                    const newsContent = `<h2><strong>Mô tả</strong></h2><p>${description}</p><h2><strong>Nguyên liệu</strong></h2><ul>${formattedIngredients.map((i) => `<li>${i}</li>`).join("")}</ul><h2><strong>Cách làm</strong></h2><ol>${steps
                        .filter((s) => s.trim())
                        .map((s) => `<li>${s}</li>`)
                        .join(
                            "",
                        )}</ol><p>Cùng chào đón món <strong>${title}</strong> cực hấp dẫn sắp có mặt tại bếp nhoa! Bé nhớ qua thử nhé. 😋</p>`;
                    console.log(newsContent);

                    await addDoc(collection(db, "news"), {
                        title: newsTitle,
                        content: newsContent,
                        imageUrl: finalImageUrl,
                        createdBy: session?.userId,
                        createdAt: serverTimestamp(),
                        isPinned: false,
                        isPublished: true,
                    });

                    // Notify kids about the new recipe announcement
                    try {
                        const kidIds = await getAllKidOneSignalIds();
                        if (kidIds.length > 0) {
                            await sendPushToUser(
                                kidIds,
                                "Tin mới từ Đầu bếp",
                                newsTitle,
                                "/kids/home",
                            );
                        }
                    } catch (err) {
                        console.error("Notify kids error:", err);
                    }
                }

                setIsDirty(false);
                if (!isAuto) {
                    toast.success("Đã lưu công thức!", { duration: 2000 });
                    navigate("/chef/recipes");
                }
            } else {
                await updateDoc(doc(db, "recipes", id!), recipeData);

                // Auto-create news if transitioning from draft to published
                if (isPublished && !initialPublished) {
                    const newsTitle = `Món mới: ${title}!`;
                    const newsContent = [
                        `🌟 **Mô tả:** ${description}`,
                        `📍 **Nguyên liệu:**\n${formattedIngredients.map((i) => `  • ${i}`).join("\n")}`,
                        `👨‍🍳 **Cách làm:**\n${steps
                            .filter((s) => s.trim())
                            .map((s, idx) => `  ${idx + 1}. ${s}`)
                            .join("\n")}`,
                        `\nĐầu bếp vừa mới hoàn thiện món **${title}**. Bé cùng khám phá ngay nhé! ❤️`,
                    ].join("\n\n");

                    await addDoc(collection(db, "news"), {
                        title: newsTitle,
                        content: newsContent,
                        imageUrl: finalImageUrl,
                        createdBy: session?.userId,
                        createdAt: serverTimestamp(),
                        isPinned: false,
                        isPublished: true,
                    });

                    // Notify kids about the newly published recipe
                    try {
                        const kidIds = await getAllKidOneSignalIds();
                        if (kidIds.length > 0) {
                            await sendPushToUser(
                                kidIds,
                                "Tin mới từ Đầu bếp",
                                newsTitle,
                                "/kids/home",
                            );
                        }
                    } catch (err) {
                        console.error("Notify kids error:", err);
                    }

                    setInitialPublished(true);
                }

                setIsDirty(false);
                if (!isAuto) {
                    toast.success("Đã lưu công thức!", { duration: 2000 });
                    navigate("/chef/recipes");
                }
            }
        } catch (error) {
            console.error("Error saving recipe:", error);
            if (!isAuto) {
                toast.error("Lỗi khi lưu công thức");
            }
        } finally {
            if (!isAuto) setSaving(false);
        }
    };

    const addIngredient = () => {
        setIngredients([...ingredients, { amount: "", unit: "", name: "" }]);
        setIsDirty(true);
    };
    const removeIngredient = (index: number) => {
        setIngredients(ingredients.filter((_, i) => i !== index));
        setIsDirty(true);
    };
    const updateIngredient = (
        index: number,
        field: keyof Ingredient,
        value: string,
    ) => {
        const newIngs = [...ingredients];
        newIngs[index][field] = value;
        setIngredients(newIngs);
        setIsDirty(true);
    };

    const addStep = () => {
        setSteps([...steps, ""]);
        setIsDirty(true);
    };
    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index));
        setIsDirty(true);
    };
    const updateStep = (index: number, value: string) => {
        const newSteps = [...steps];
        newSteps[index] = value;
        setSteps(newSteps);
        setIsDirty(true);
    };

    const addReviewRule = () => {
        const usedStars = reviewTags.map((r) => r.star);
        const availableStar = [5, 4, 3, 2, 1].find(
            (s) => !usedStars.includes(s),
        );

        if (!availableStar) {
            toast.error("Tất cả số sao đều đã có gợi ý!");
            return;
        }

        setReviewTags([...reviewTags, { star: availableStar, tags: [] }]);
        setRtInput([...rtInput, ""]);
        setIsDirty(true);
    };

    const removeReviewRule = (index: number) => {
        setReviewTags(reviewTags.filter((_, i) => i !== index));
        setRtInput(rtInput.filter((_, i) => i !== index));
        setIsDirty(true);
    };

    const updateReviewRule = (index: number, value: number) => {
        const newRules = [...reviewTags];
        newRules[index].star = value;
        setReviewTags(newRules);
        setIsDirty(true);
    };

    const addReviewTagToRule = (ruleIdx: number, value: string) => {
        if (!value.trim()) return;
        const newRules = [...reviewTags];
        if (!newRules[ruleIdx].tags.includes(value.trim())) {
            newRules[ruleIdx].tags = [...newRules[ruleIdx].tags, value.trim()];
            setReviewTags(newRules);
            setIsDirty(true);
        }
        const newInputs = [...rtInput];
        newInputs[ruleIdx] = "";
        setRtInput(newInputs);
    };

    const removeReviewTagFromRule = (ruleIdx: number, tagIdx: number) => {
        const newRules = [...reviewTags];
        newRules[ruleIdx].tags = newRules[ruleIdx].tags.filter(
            (_, i) => i !== tagIdx,
        );
        setReviewTags(newRules);
        setIsDirty(true);
    };

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && tagInput.trim()) {
            e.preventDefault();
            if (!tags.includes(tagInput.trim())) {
                setTags([...tags, tagInput.trim()]);
                setIsDirty(true);
            }
            setTagInput("");
        }
    };

    const removeTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
        setIsDirty(true);
    };

    if (loading)
        return (
            <div className="flex items-center justify-center p-24">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );

    return (
        <div className="page-container px-3 md:px-4">
            <div className="page-header shrink-0 pt-4 md:pt-5 mb-4 md:mb-6">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                        <button
                            onClick={handleBack}
                            className="p-2 md:p-3 bg-card rounded-xl md:rounded-2xl border border-border text-muted-foreground hover:text-primary transition-all flex items-center gap-2 group shrink-0"
                        >
                            <ArrowLeft
                                size={18}
                                className="md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform"
                            />
                        </button>
                        <div className="space-y-[1px] md:space-y-[2px] overflow-hidden">
                            <h1 className="text-[18px] font-semibold text-foreground truncate">
                                {isNew ? "Thêm công thức" : "Chỉnh sửa"}
                            </h1>
                            <p className="text-[12px] font-normal text-muted-foreground truncate">
                                {isNew
                                    ? "Tạo món ăn mới"
                                    : "Cập nhật lại thông tin"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 shrink-0">
                        <button
                            onClick={() => handleSave()}
                            disabled={saving || !title}
                            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl shadow-lg shadow-primary-shadow/30 hover:opacity-90 transition-all disabled:opacity-50 text-[13px] md:text-base"
                        >
                            {saving ? (
                                <Loader2 className="animate-spin" size={16} />
                            ) : (
                                <Save size={16} className="md:w-5 md:h-5" />
                            )}
                            <span className="hidden xs:inline">Lưu</span>
                            <span className="inline xs:hidden">Lưu</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="page-content">
                <div className="max-w-4xl mx-auto pb-12">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                        <div className="lg:col-span-2 space-y-6 md:space-y-8">
                            {/* Main Info */}
                            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-secondary/30 border-b border-border/50">
                                    <h2 className="text-[15px] font-bold text-foreground">
                                        Thông tin chung
                                    </h2>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div>
                                        <label className="block text-[12px] font-medium text-muted-foreground mb-1.5 px-0.5">
                                            Tên công thức
                                        </label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) =>
                                                setTitle(e.target.value)
                                            }
                                            placeholder="Ví dụ: Cháo Cá Hồi Cà Rốt"
                                            className="w-full px-4 py-3 bg-secondary border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-muted-foreground mb-1.5 px-0.5">
                                            Mô tả ngắn
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={description}
                                            onChange={(e) =>
                                                setDescription(e.target.value)
                                            }
                                            placeholder="Món ăn giàu Omega-3, tốt cho não bộ của bé..."
                                            className="w-full px-4 py-3 bg-secondary border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all resize-none text-sm text-foreground"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Ingredients */}
                            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-secondary/30 border-b border-border/50 flex items-center justify-between">
                                    <h2 className="text-[15px] font-bold text-foreground">
                                        Nguyên liệu
                                    </h2>
                                    <button
                                        onClick={addIngredient}
                                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                                <div className="p-4 space-y-3">
                                    {ingredients.map((ing, idx) => (
                                        <div
                                            key={idx}
                                            className="flex gap-2 p-2 bg-secondary/20 rounded-xl"
                                        >
                                            <input
                                                type="text"
                                                placeholder="Lượng"
                                                value={ing.amount}
                                                onChange={(e) =>
                                                    updateIngredient(
                                                        idx,
                                                        "amount",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-[60px] px-2 py-2 bg-background border border-border/50 rounded-lg focus:border-primary outline-none text-[13px] text-center"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Đv"
                                                value={ing.unit}
                                                onChange={(e) =>
                                                    updateIngredient(
                                                        idx,
                                                        "unit",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-[60px] px-2 py-2 bg-background border border-border/50 rounded-lg focus:border-primary outline-none text-[13px] text-center"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Tên nguyên liệu..."
                                                value={ing.name}
                                                onChange={(e) =>
                                                    updateIngredient(
                                                        idx,
                                                        "name",
                                                        e.target.value,
                                                    )
                                                }
                                                className="flex-1 px-3 py-2 bg-background border border-border/50 rounded-lg focus:border-primary outline-none text-[13px]"
                                            />
                                            <button
                                                onClick={() =>
                                                    removeIngredient(idx)
                                                }
                                                className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Steps */}
                            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-secondary/30 border-b border-border/50 flex items-center justify-between">
                                    <h2 className="text-[15px] font-bold text-foreground">
                                        Cách làm
                                    </h2>
                                    <button
                                        onClick={addStep}
                                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                                <div className="p-4 space-y-4">
                                    {steps.map((step, idx) => (
                                        <div key={idx} className="flex gap-3">
                                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0 mt-2">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 relative">
                                                <textarea
                                                    rows={2}
                                                    value={step}
                                                    onChange={(e) =>
                                                        updateStep(
                                                            idx,
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={`Bước ${idx + 1}...`}
                                                    className="w-full px-4 py-3 bg-secondary/30 border border-border/50 rounded-xl focus:border-primary outline-none resize-none text-[13px] text-foreground"
                                                />
                                                <button
                                                    onClick={() =>
                                                        removeStep(idx)
                                                    }
                                                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-1"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Review Tags Rules */}
                            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-secondary/30 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-[15px] font-bold text-foreground">
                                            Gợi ý đánh giá nhanh
                                        </h2>
                                        <p className="text-[11px] text-muted-foreground">
                                            Tự động hiển thị từ khóa theo số sao
                                            bé chọn
                                        </p>
                                    </div>
                                    <button
                                        onClick={addReviewRule}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary font-bold rounded-lg hover:bg-primary/20 transition-all text-[11px]"
                                    >
                                        <Plus size={14} />
                                        Thêm luật
                                    </button>
                                </div>

                                <div className="p-4 space-y-4 text-sm">
                                    {!Array.isArray(reviewTags) ||
                                    reviewTags.length === 0 ? (
                                        <div className="text-center py-8 border-2 border-dashed border-border/50 rounded-xl bg-secondary/10">
                                            <Star
                                                size={24}
                                                className="mx-auto text-muted-foreground/20 mb-2"
                                            />
                                            <p className="text-[12px] text-muted-foreground">
                                                Chưa có gợi ý nào
                                            </p>
                                        </div>
                                    ) : (
                                        reviewTags.map((rule, idx) => (
                                            <div
                                                key={idx}
                                                className="p-4 bg-secondary/20 border border-border/50 rounded-xl space-y-4 relative group/rule"
                                            >
                                                <button
                                                    onClick={() =>
                                                        removeReviewRule(idx)
                                                    }
                                                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-destructive text-destructive-foreground shadow-sm flex items-center justify-center transition-all z-10"
                                                >
                                                    <Trash2 size={12} />
                                                </button>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[12px] font-bold text-muted-foreground">
                                                            Khi chọn
                                                        </span>
                                                        <select
                                                            value={rule.star}
                                                            onChange={(e) =>
                                                                updateReviewRule(
                                                                    idx,
                                                                    parseInt(
                                                                        e.target
                                                                            .value,
                                                                    ),
                                                                )
                                                            }
                                                            className="bg-background border border-border/50 rounded-lg px-2 py-1 text-[12px] font-bold text-foreground outline-none focus:border-primary"
                                                        >
                                                            {[
                                                                5, 4, 3, 2, 1,
                                                            ].map((s) => {
                                                                const isUsed =
                                                                    reviewTags.some(
                                                                        (
                                                                            r,
                                                                            i,
                                                                        ) =>
                                                                            r.star ===
                                                                                s &&
                                                                            i !==
                                                                                idx,
                                                                    );
                                                                return (
                                                                    <option
                                                                        key={s}
                                                                        value={
                                                                            s
                                                                        }
                                                                        disabled={
                                                                            isUsed
                                                                        }
                                                                    >
                                                                        {s} sao{" "}
                                                                        {isUsed
                                                                            ? "(Đã có)"
                                                                            : ""}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>

                                                    <div className="flex gap-0.5">
                                                        {Array.from({
                                                            length: 5,
                                                        }).map((_, sIdx) => (
                                                            <Star
                                                                key={sIdx}
                                                                size={10}
                                                                className={
                                                                    sIdx + 1 <=
                                                                    rule.star
                                                                        ? "fill-orange-400 text-orange-400"
                                                                        : "text-muted/10"
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {rule.tags.map(
                                                            (tag, tIdx) => (
                                                                <span
                                                                    key={tIdx}
                                                                    className="flex items-center gap-1 bg-background border border-border/50 px-2 py-1 rounded-lg text-[11px] font-bold text-foreground shadow-sm"
                                                                >
                                                                    {tag}
                                                                    <button
                                                                        onClick={() =>
                                                                            removeReviewTagFromRule(
                                                                                idx,
                                                                                tIdx,
                                                                            )
                                                                        }
                                                                        className="text-muted-foreground hover:text-destructive"
                                                                    >
                                                                        <X
                                                                            size={
                                                                                10
                                                                            }
                                                                        />
                                                                    </button>
                                                                </span>
                                                            ),
                                                        )}
                                                    </div>
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            value={
                                                                rtInput[idx] ||
                                                                ""
                                                            }
                                                            onChange={(e) => {
                                                                const newInputs =
                                                                    [
                                                                        ...rtInput,
                                                                    ];
                                                                newInputs[idx] =
                                                                    e.target.value;
                                                                setRtInput(
                                                                    newInputs,
                                                                );
                                                            }}
                                                            onKeyDown={(e) =>
                                                                e.key ===
                                                                    "Enter" &&
                                                                (e.preventDefault(),
                                                                addReviewTagToRule(
                                                                    idx,
                                                                    rtInput[
                                                                        idx
                                                                    ],
                                                                ))
                                                            }
                                                            placeholder="Thêm thẻ (Ví dụ: Thơm, Ngon...)"
                                                            className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-[11px] font-bold outline-none focus:border-primary transition-all pr-8"
                                                        />
                                                        <button
                                                            onClick={() =>
                                                                addReviewTagToRule(
                                                                    idx,
                                                                    rtInput[
                                                                        idx
                                                                    ],
                                                                )
                                                            }
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:scale-110 transition-transform"
                                                        >
                                                            <Plus size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="space-y-6 md:space-y-8">
                            {/* Image Upload */}
                            <section className="bg-card p-5 md:p-6 rounded-[24px] md:rounded-3xl border border-border shadow-sm">
                                <h2 className="text-[12px] md:text-sm font-bold text-muted-foreground mb-3 px-1 uppercase tracking-wider">
                                    Ảnh món ăn
                                </h2>
                                <div className="relative group aspect-square rounded-2xl bg-secondary border-2 border-dashed border-border overflow-hidden flex flex-col items-center justify-center text-center p-4">
                                    {imagePreview ? (
                                        <>
                                            <img
                                                src={getOptimizedUrl(
                                                    imagePreview,
                                                    800,
                                                )}
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                            {uploadingImage && (
                                                <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                                                    <Loader2
                                                        className="animate-spin text-primary"
                                                        size={28}
                                                        md:size={32}
                                                    />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <label
                                                    className={`cursor-pointer bg-white/20 backdrop-blur-md text-white p-3 md:p-4 rounded-full border border-white/40 ${uploadingImage ? "pointer-events-none" : ""}`}
                                                >
                                                    <Upload
                                                        size={20}
                                                        md:size={24}
                                                    />
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={
                                                            handleImageChange
                                                        }
                                                        disabled={
                                                            uploadingImage
                                                        }
                                                    />
                                                </label>
                                            </div>
                                        </>
                                    ) : (
                                        <label
                                            className={`cursor-pointer flex flex-col items-center ${uploadingImage ? "pointer-events-none" : ""}`}
                                        >
                                            {uploadingImage ? (
                                                <Loader2
                                                    className="animate-spin text-primary"
                                                    size={28}
                                                    md:size={32}
                                                />
                                            ) : (
                                                <>
                                                    <Upload
                                                        size={28}
                                                        md:size={32}
                                                        className="text-muted-foreground/30 mb-2"
                                                    />
                                                    <span className="text-[11px] md:text-xs font-bold text-muted-foreground/40 italic">
                                                        Tải ảnh lên
                                                    </span>
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleImageChange}
                                                disabled={uploadingImage}
                                            />
                                        </label>
                                    )}
                                </div>
                            </section>

                            {/* Status & Options */}
                            <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden space-y-4">
                                <div className="px-4 py-3 bg-secondary/30 border-b border-border/50">
                                    <h2 className="text-[15px] font-bold text-foreground">
                                        Trạng thái
                                    </h2>
                                </div>

                                <div className="px-4 pb-4 space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl border border-border/50">
                                        <div className="flex flex-col gap-0.5 ml-1">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                Chế độ
                                            </span>
                                            <span
                                                className={`text-[13px] font-bold ${isPublished ? "text-green-600" : "text-amber-600"}`}
                                            >
                                                {isPublished
                                                    ? "Công khai"
                                                    : "Bản nháp"}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() =>
                                                setIsPublished(!isPublished)
                                            }
                                            className={`relative w-12 h-6 rounded-full transition-all duration-300 shadow-inner ${isPublished ? "bg-green-500 shadow-green-600/20" : "bg-amber-500 shadow-amber-600/20"}`}
                                        >
                                            <div
                                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 transform ${isPublished ? "translate-x-6" : "translate-x-0"}`}
                                            />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-[12px] font-bold text-muted-foreground mb-2 px-1 uppercase tracking-wider">
                                            Gắn thẻ
                                        </label>
                                        <div className="flex flex-wrap gap-1.5 mb-3">
                                            {tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="flex items-center gap-1 bg-primary/10 text-primary text-[11px] font-bold px-2.5 py-1 rounded-lg border border-primary/20"
                                                >
                                                    {tag}
                                                    <button
                                                        onClick={() =>
                                                            removeTag(tag)
                                                        }
                                                        className="hover:text-destructive"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={tagInput}
                                                onChange={(e) =>
                                                    setTagInput(e.target.value)
                                                }
                                                onKeyDown={addTag}
                                                placeholder="Nhập thẻ + Enter"
                                                className="w-full px-4 py-2.5 text-[12px] bg-secondary border border-border/50 rounded-xl outline-none focus:border-primary text-foreground"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={showLeaveConfirm}
                onClose={() => setShowLeaveConfirm(false)}
                onConfirm={() => navigate("/chef/recipes")}
                icon={<AlertTriangle size={24} className="text-amber-500" />}
                title="Chưa lưu thay đổi?"
                message="Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang không?"
                confirmText="Rời khỏi trang"
                cancelText="Tiếp tục chỉnh sửa"
                confirmStyle="warning"
            />
        </div>
    );
}
