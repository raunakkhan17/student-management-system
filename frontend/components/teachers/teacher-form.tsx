'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Copy, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/common/page-header';
import { AddressFields } from '@/components/students/address-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { emptyAddress, addressFormSchema } from '@/lib/validations/student';
import { academicService } from '@/services/academic.service';
import { teacherService } from '@/services/teacher.service';
import {
  BLOOD_GROUP_LABELS,
  BloodGroup,
  GENDER_LABELS,
  Gender,
} from '@/types/enums';
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType } from '@/types/teacher';

const NONE = '__none__';
const GENDERS = Object.values(Gender);
const BLOOD_GROUPS = Object.values(BloodGroup);
const EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'];

const formSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'Enter a valid phone number'),
  employeeId: z.string().trim().max(40).optional(),
  departmentId: z.string().optional(),
  designation: z.string().trim().min(1, 'Designation is required').max(120),
  qualification: z.string().trim().min(1, 'Qualification is required').max(200),
  specialization: z.string().trim().max(160).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60),
  joiningDate: z.string().min(1, 'Joining date is required'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING']),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.union([z.nativeEnum(BloodGroup), z.literal('')]).optional(),
  address: addressFormSchema,
  subjectIds: z.array(z.string().uuid()),
  createPortalAccount: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function TeacherForm() {
  const router = useRouter();
  const [provisioned, setProvisioned] = useState<{ email: string; temporaryPassword: string } | null>(
    null,
  );

  const departments = useQuery({
    queryKey: ['academics', 'departments', 'all'],
    queryFn: () => academicService.listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const subjects = useQuery({
    queryKey: ['academics', 'subjects', 'options'],
    queryFn: () => academicService.listSubjectOptions(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      employeeId: '',
      departmentId: NONE,
      designation: '',
      qualification: '',
      specialization: '',
      experienceYears: 0,
      joiningDate: new Date().toISOString().slice(0, 10),
      employmentType: 'FULL_TIME',
      gender: Gender.MALE,
      dateOfBirth: '',
      bloodGroup: '',
      address: emptyAddress,
      subjectIds: [],
      createPortalAccount: true,
    },
  });

  const selectedSubjectIds = form.watch('subjectIds');

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      teacherService.create({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        ...(values.employeeId ? { employeeId: values.employeeId } : {}),
        departmentId: values.departmentId === NONE ? null : (values.departmentId ?? null),
        designation: values.designation,
        qualification: values.qualification,
        ...(values.specialization ? { specialization: values.specialization } : {}),
        experienceYears: values.experienceYears,
        joiningDate: values.joiningDate,
        employmentType: values.employmentType,
        gender: values.gender,
        ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
        bloodGroup: values.bloodGroup === '' ? null : (values.bloodGroup ?? null),
        address: { type: 'PERMANENT', ...values.address },
        subjectIds: values.subjectIds,
        createPortalAccount: values.createPortalAccount,
      }),
    onSuccess: (result) => {
      toast.success(`${result.teacher.employeeId} added successfully`);
      if (result.provisionedAccount) {
        setProvisioned(result.provisionedAccount);
      } else {
        router.push(`/teachers/${result.teacher.id}`);
      }
    },
  });

  // Clear the credentials panel if the user navigates back to the form.
  useEffect(() => () => setProvisioned(null), []);

  const onSubmit = async (values: FormValues) => {
    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, [
        'firstName',
        'lastName',
        'email',
        'phone',
        'employeeId',
        'designation',
        'qualification',
      ]);
      if (message) toast.error(message);
    }
  };

  const toggleSubject = (subjectId: string) => {
    const current = form.getValues('subjectIds');
    form.setValue(
      'subjectIds',
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  };

  if (provisioned) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Teacher added"
          description="Save these credentials now — the password is not shown again."
        />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-sm">Email</p>
              <p className="font-medium">{provisioned.email}</p>
              <p className="text-muted-foreground mt-3 text-sm">Temporary password</p>
              <div className="flex items-center gap-2">
                <code className="bg-muted rounded px-2 py-1 font-mono text-sm">
                  {provisioned.temporaryPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => {
                    void navigator.clipboard.writeText(provisioned.temporaryPassword);
                    toast.success('Password copied');
                  }}
                  aria-label="Copy password"
                >
                  <Copy className="size-4" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => router.push('/teachers')}>Back to teachers</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setProvisioned(null);
                  form.reset();
                }}
              >
                Add another teacher
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Add a teacher"
        description="Creates the staff record and, optionally, their portal login."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Teachers', href: '/teachers' },
          { label: 'Add' },
        ]}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {createMutation.error instanceof ApiError &&
            Object.keys(createMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>Could not add the teacher</AlertTitle>
                <AlertDescription>{createMutation.error.message}</AlertDescription>
              </Alert>
            )}

          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GENDERS.map((gender) => (
                          <SelectItem key={gender} value={gender}>
                            {GENDER_LABELS[gender]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bloodGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blood group</FormLabel>
                    <Select
                      value={field.value === '' ? NONE : (field.value ?? NONE)}
                      onValueChange={(value) => field.onChange(value === NONE ? '' : value)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not recorded" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not recorded</SelectItem>
                        {BLOOD_GROUPS.map((group) => (
                          <SelectItem key={group} value={group}>
                            {BLOOD_GROUP_LABELS[group]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
              <CardDescription>
                Leave the employee ID blank to generate one automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Auto-generated" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not assigned</SelectItem>
                        {(departments.data?.items ?? []).map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Assistant Professor" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {EMPLOYMENT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="qualification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualification</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="M.Sc., B.Ed." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="specialization"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specialization</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Organic chemistry" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="experienceYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience (years)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} max={60} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Joining date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
              <CardDescription>
                Subjects this teacher is qualified to teach. Class assignments happen separately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(subjects.data ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No subjects have been created yet. Add them under Academic setup.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(subjects.data ?? []).map((subject) => {
                    const isSelected = selectedSubjectIds.includes(subject.id);
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => toggleSubject(subject.id)}
                        aria-pressed={isSelected}
                        className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Badge
                          variant={isSelected ? 'default' : 'outline'}
                          className="cursor-pointer px-3 py-1"
                        >
                          {subject.name}
                          <span className={isSelected ? 'opacity-80' : 'text-muted-foreground'}>
                            {' '}
                            {subject.code}
                          </span>
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent>
              <AddressFields control={form.control} prefix="address" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="createPortalAccount"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="createPortalAccount"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel htmlFor="createPortalAccount" className="cursor-pointer">
                        Activate the teacher&apos;s login
                      </FormLabel>
                      <FormDescription>
                        A temporary password is generated and emailed to them.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/teachers')}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                  Saving…
                </>
              ) : (
                <>
                  <UserPlus className="size-4" aria-hidden />
                  Add teacher
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
