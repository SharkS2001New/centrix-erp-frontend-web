"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, FormModal, inputClassName } from "@/components/catalog/catalog-shared";

export function SubcategoryCreateModal({ open, categories = [], onClose, onCreated }) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setCategoryId(categories.length === 1 ? String(categories[0].id) : "");
    setName("");
    setDescription("");
    setError(null);
  }, [open, categories]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Sub-category name is required.");
      return;
    }
    if (!categoryId) {
      setError("Select a parent category.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const sub = await apiRequest("/sub-categories", {
        method: "POST",
        body: {
          category_id: Number(categoryId),
          subcategory_name: trimmed,
        },
      });
      onCreated?.(sub.data ?? sub);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create sub-category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Create sub-category"
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      submitLabel="Create"
    >
      <Field label="Category">
        <select
          className={inputClassName()}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
        >
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.category_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sub-category name" required>
        <input
          className={inputClassName()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sugar"
          autoFocus
        />
      </Field>
      <Field label="Description (optional)">
        <textarea
          rows={2}
          className={inputClassName()}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short note for your team"
        />
      </Field>
    </FormModal>
  );
}
