import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/app/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Badge } from '@/app/components/ui/badge';
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  GripVertical,
  MessageSquare,
  ToggleLeft,
  ToggleRight,
  Quote,
  Users,
  Sparkles,
  TrendingUp,
  Heart,
  ShieldCheck,
} from 'lucide-react';
import { testimonialsApi, Testimonial } from '@/lib/api';
import { toast } from 'sonner';

export default function TestimonialsPage() {
  const { t } = useTranslation();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    company: '',
    content: '',
    rating: 5,
    isActive: true,
    order: 0,
  });

  useEffect(() => {
    fetchTestimonials();
  }, []);

  const fetchTestimonials = async () => {
    try {
      setLoading(true);
      const response = await testimonialsApi.getAllAdmin();
      setTestimonials(response.data || []);
    } catch (error) {
      console.error('Failed to fetch testimonials:', error);
      toast.error(t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTestimonial) {
        await testimonialsApi.update(editingTestimonial._id, formData);
        toast.success(t('common.success'));
      } else {
        await testimonialsApi.create(formData);
        toast.success(t('common.success'));
      }
      setDialogOpen(false);
      resetForm();
      fetchTestimonials();
    } catch (error) {
      console.error('Failed to save testimonial:', error);
      toast.error(t('errors.saveFailed'));
    }
  };

  const handleEdit = (testimonial: Testimonial) => {
    setEditingTestimonial(testimonial);
    setFormData({
      name: testimonial.name,
      role: testimonial.role,
      company: testimonial.company,
      content: testimonial.content,
      rating: testimonial.rating,
      isActive: testimonial.isActive,
      order: testimonial.order,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await testimonialsApi.delete(id);
      toast.success(t('common.success'));
      fetchTestimonials();
    } catch (error) {
      console.error('Failed to delete testimonial:', error);
      toast.error(t('errors.deleteFailed'));
    }
  };

  const handleToggle = async (testimonial: Testimonial) => {
    try {
      await testimonialsApi.toggle(testimonial._id);
      toast.success(t('common.success'));
      fetchTestimonials();
    } catch (error) {
      console.error('Failed to toggle testimonial:', error);
      toast.error(t('errors.updateFailed'));
    }
  };

  const resetForm = () => {
    setEditingTestimonial(null);
    setFormData({
      name: '',
      role: '',
      company: '',
      content: '',
      rating: 5,
      isActive: true,
      order: 0,
    });
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const activeCount = testimonials.filter(t => t.isActive).length;
  const avgRating = testimonials.length > 0
    ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1)
    : '0.0';

  return (
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] w-full space-y-6">

          {/* Hero Header */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="p-6 lg:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/10">
                      <Quote className="mr-1 h-3.5 w-3.5" />
                      Testimonials
                    </Badge>
                    <Badge className="bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200">
                      <ShieldCheck className="mr-1 h-3 w-3" /> {activeCount} active
                    </Badge>
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                    {t('nav.testimonials') || 'Testimonials'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-300 sm:text-base">
                    {t('testimonials.description') || 'Manage customer testimonials for your landing page'}
                  </p>
                </div>

                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button onClick={openNewDialog} className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">
                      <Plus className="mr-1.5 h-4 w-4" />
                      {t('common.add') || 'Add New'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950">
                    {/* Dialog header */}
                    <div className="bg-slate-50 px-6 pb-6 pt-6 dark:bg-slate-950">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30">
                          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {editingTestimonial ? 'Edit' : 'Create'}
                          </p>
                          <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                            {editingTestimonial
                              ? (t('common.edit') || 'Edit Testimonial')
                              : (t('common.add') || 'Add Testimonial')}
                          </h3>
                        </div>
                      </div>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4 p-6">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.name') || 'Name'}</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="role" className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.role') || 'Role'}</Label>
                          <Input
                            id="role"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            placeholder="e.g. Manager"
                            className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company" className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.company') || 'Company'}</Label>
                          <Input
                            id="company"
                            value={formData.company}
                            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                            className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="content" className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.content') || 'Testimonial Content'}</Label>
                        <Textarea
                          id="content"
                          value={formData.content}
                          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                          rows={4}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.rating') || 'Rating'}</Label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setFormData({ ...formData, rating: star })}
                              className="p-1 transition-transform hover:scale-110"
                            >
                              <Star
                                className={`h-7 w-7 ${
                                  star <= formData.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="order" className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('testimonials.order') || 'Display Order'}</Label>
                        <Input
                          id="order"
                          type="number"
                          min="0"
                          value={formData.order}
                          onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <DialogFooter className="pt-2">
                        <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-700">
                          {editingTestimonial ? (t('common.update') || 'Update') : (t('common.save') || 'Save')}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Metric tiles */}
              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Testimonials</p>
                  <p className="mt-3 text-3xl font-bold">{testimonials.length}</p>
                  <p className="mt-2 text-xs text-slate-400">{activeCount} active</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Average Rating</p>
                  <div className="mt-3 flex items-center gap-2">
                    <p className="text-3xl font-bold">{avgRating}</p>
                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">out of 5 stars</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Active Rate</p>
                  <p className="mt-3 text-3xl font-bold">
                    {testimonials.length > 0 ? Math.round((activeCount / testimonials.length) * 100) : 0}%
                  </p>
                  <p className="mt-2 text-xs text-slate-400">visible on landing page</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table Card */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-900/20">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <MessageSquare className="h-5 w-5 text-indigo-500" />
                {t('testimonials.manage') || 'Manage Testimonials'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : testimonials.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                    <Users className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('testimonials.noTestimonials') || 'No testimonials yet. Add your first testimonial!'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('testimonials.name') || 'Name'}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('testimonials.company') || 'Company'}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('testimonials.content') || 'Content'}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('testimonials.rating') || 'Rating'}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('testimonials.status') || 'Status'}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('common.actions') || 'Actions'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {testimonials.map((testimonial) => (
                        <TableRow key={testimonial._id} className="border-slate-100 dark:border-slate-800">
                          <TableCell>
                            <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 cursor-grab" />
                          </TableCell>
                          <TableCell className="font-medium text-slate-800 dark:text-white">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold dark:bg-indigo-950/30 dark:text-indigo-400">
                                {testimonial.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-semibold">{testimonial.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{testimonial.role}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{testimonial.company}</TableCell>
                          <TableCell className="max-w-xs text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate" title={testimonial.content}>{testimonial.content}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-4 w-4 ${
                                    i < testimonial.rating
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-slate-200 dark:text-slate-700'
                                  }`}
                                />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={testimonial.isActive
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }>
                              {testimonial.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggle(testimonial)}
                                title={testimonial.isActive ? 'Deactivate' : 'Activate'}
                                className="h-8 w-8 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              >
                                {testimonial.isActive ? (
                                  <ToggleRight className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 text-slate-400" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(testimonial)}
                                className="h-8 w-8 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(testimonial._id)}
                                className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
