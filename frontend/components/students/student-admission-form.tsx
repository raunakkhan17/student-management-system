'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Copy, Plus, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Separator } from '@/components/ui/separator';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import {
  emptyAddress,
  emptyGuardian,
  studentFormSchema,
  type StudentFormValues,
} from '@/lib/validations/student';
import { academicService } from '@/services/academic.service';
import { studentService } from '@/services/student.service';
import {
  BLOOD_GROUP_LABELS,
  BloodGroup,
  GENDER_LABELS,
  Gender,
} from '@/types/enums';
import { GUARDIAN_RELATION_LABELS, type GuardianRelation } from '@/types/student';
import { AddressFields } from './address-fields';

const NONE = '__none__';

const GENDERS = Object.values(Gender);
const BLOOD_GROUPS = Object.values(BloodGroup);
const RELATIONS: GuardianRelation[] = ['FATHER', 'MOTHER', 'GUARDIAN', 'SIBLING', 'OTHER'];

/** Full admission workflow (PRD Module 3 — Student Registration). */
export function StudentAdmissionForm() {
  const router = useRouter();
  const [provisioned, setProvisioned] = useState<{ email: string; temporaryPassword: string }[]>([]);

  const years = useQuery({
    queryKey: ['academics', 'academic-years', 'all'],
    queryFn: () => academicService.listYears({ limit: 100, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const classOptions = useQuery({
    queryKey: ['academics', 'classes', 'options'],
    queryFn: () => academicService.listClassOptions(),
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      admissionNumber: '',
      rollNumber: '',
      admissionDate: new Date().toISOString().slice(0, 10),
      academicYearId: '',
      classId: NONE,
      sectionId: NONE,
      gender: Gender.MALE,
      dateOfBirth: '',
      bloodGroup: '',
      aadhaarNumber: '',
      nationality: 'India',
      religion: '',
      category: '',
      motherTongue: '',
      previousSchool: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
      permanentAddress: emptyAddress,
      sameAsPermanent: true,
      currentAddress: emptyAddress,
      guardians: [emptyGuardian],
      createPortalAccount: true,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'guardians' });

  const selectedClassId = form.watch('classId');
  const sameAsPermanent = form.watch('sameAsPermanent');

  const sectionChoices = useMemo(
    () => classOptions.data?.find((option) => option.id === selectedClassId)?.sections ?? [],
    [classOptions.data, selectedClassId],
  );

  // Default to the current academic year once the list arrives.
  useEffect(() => {
    const current = years.data?.items.find((year) => year.isCurrent);
    if (current && !form.getValues('academicYearId')) {
      form.setValue('academicYearId', current.id);
    }
  }, [years.data, form]);

  const createMutation = useMutation({
    mutationFn: (values: StudentFormValues) =>
      studentService.create({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.admissionNumber ? { admissionNumber: values.admissionNumber } : {}),
        ...(values.rollNumber ? { rollNumber: values.rollNumber } : {}),
        admissionDate: values.admissionDate,
        academicYearId: values.academicYearId,
        classId: values.classId === NONE ? null : (values.classId ?? null),
        sectionId: values.sectionId === NONE ? null : (values.sectionId ?? null),
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
        bloodGroup: values.bloodGroup === '' ? null : (values.bloodGroup ?? null),
        ...(values.aadhaarNumber ? { aadhaarNumber: values.aadhaarNumber } : {}),
        nationality: values.nationality,
        ...(values.religion ? { religion: values.religion } : {}),
        ...(values.category ? { category: values.category } : {}),
        ...(values.motherTongue ? { motherTongue: values.motherTongue } : {}),
        ...(values.previousSchool ? { previousSchool: values.previousSchool } : {}),
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,
        emergencyContactRelation: values.emergencyContactRelation,
        permanentAddress: { type: 'PERMANENT', ...values.permanentAddress },
        sameAsPermanent: values.sameAsPermanent,
        ...(values.sameAsPermanent || !values.currentAddress?.line1
          ? {}
          : {
              currentAddress: {
                type: 'CURRENT',
                line1: values.currentAddress.line1,
                line2: values.currentAddress.line2 ?? '',
                landmark: values.currentAddress.landmark ?? '',
                city: values.currentAddress.city ?? '',
                state: values.currentAddress.state ?? '',
                country: values.currentAddress.country ?? 'India',
                postalCode: values.currentAddress.postalCode ?? '',
              },
            }),
        guardians: values.guardians.map((guardian) => ({
          firstName: guardian.firstName,
          lastName: guardian.lastName,
          relation: guardian.relation,
          ...(guardian.occupation ? { occupation: guardian.occupation } : {}),
          ...(guardian.organization ? { organization: guardian.organization } : {}),
          phone: guardian.phone,
          ...(guardian.alternatePhone ? { alternatePhone: guardian.alternatePhone } : {}),
          ...(guardian.email ? { email: guardian.email } : {}),
          ...(guardian.annualIncome !== '' && guardian.annualIncome !== undefined
            ? { annualIncome: Number(guardian.annualIncome) }
            : {}),
          ...(guardian.aadhaarNumber ? { aadhaarNumber: guardian.aadhaarNumber } : {}),
          ...(guardian.qualification ? { qualification: guardian.qualification } : {}),
          isPrimary: guardian.isPrimary,
          createPortalAccount: guardian.createPortalAccount,
        })),
        createPortalAccount: values.createPortalAccount,
      }),
    onSuccess: (result) => {
      toast.success(`${result.student.admissionNumber} admitted successfully`);
      if (result.provisionedAccounts.length > 0) {
        // Shown once so an administrator can hand credentials over directly.
        setProvisioned(result.provisionedAccounts);
      } else {
        router.push(`/students/${result.student.id}`);
      }
    },
  });

  const onSubmit = async (values: StudentFormValues) => {
    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      const message = applyApiErrors(error, form.setError, [
        'firstName',
        'lastName',
        'email',
        'phone',
        'admissionNumber',
        'rollNumber',
        'aadhaarNumber',
        'classId',
        'sectionId',
        'academicYearId',
      ]);
      if (message) toast.error(message);
    }
  };

  if (provisioned.length > 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Student admitted"
          description="Save these credentials now — the passwords are not shown again."
        />
        <Card>
          <CardContent className="space-y-4 pt-6">
            {provisioned.map((account) => (
              <div key={account.email} className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">Email</p>
                <p className="font-medium">{account.email}</p>
                <p className="text-muted-foreground mt-3 text-sm">Temporary password</p>
                <div className="flex items-center gap-2">
                  <code className="bg-muted rounded px-2 py-1 font-mono text-sm">
                    {account.temporaryPassword}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => {
                      void navigator.clipboard.writeText(account.temporaryPassword);
                      toast.success('Password copied');
                    }}
                    aria-label="Copy password"
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => router.push('/students')}>Back to students</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setProvisioned([]);
                  form.reset();
                }}
              >
                Admit another student
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
        title="Admit a student"
        description="Creates the student record, their login and any guardian accounts in one step."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Students', href: '/students' },
          { label: 'Admit' },
        ]}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {createMutation.error instanceof ApiError &&
            Object.keys(createMutation.error.fieldErrors).length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>Admission failed</AlertTitle>
                <AlertDescription>{createMutation.error.message}</AlertDescription>
              </Alert>
            )}

          {/* ---------------------------------------------------------- Identity */}
          <Card>
            <CardHeader>
              <CardTitle>Student details</CardTitle>
              <CardDescription>Name and contact information for the student.</CardDescription>
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
                      <Input {...field} type="email" placeholder="student@institution.edu" />
                    </FormControl>
                    <FormDescription>Used as the sign-in identifier.</FormDescription>
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
            </CardContent>
          </Card>

          {/* --------------------------------------------------------- Admission */}
          <Card>
            <CardHeader>
              <CardTitle>Admission &amp; placement</CardTitle>
              <CardDescription>
                Leave the admission number blank to generate one automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="admissionNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admission number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Auto-generated" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rollNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Roll number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="admissionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admission date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="academicYearId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic year</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an academic year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(years.data?.items ?? []).map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.name}
                            {year.isCurrent ? ' (current)' : ''}
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
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('sectionId', NONE);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unplaced" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Leave unplaced</SelectItem>
                        {(classOptions.data ?? []).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.code})
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
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={field.onChange}
                      disabled={!selectedClassId || selectedClassId === NONE}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Leave unassigned</SelectItem>
                        {sectionChoices.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Section capacity is checked on save.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ---------------------------------------------------------- Personal */}
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
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
              <FormField
                control={form.control}
                name="aadhaarNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aadhaar number</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="12 digits" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motherTongue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mother tongue</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="religion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Religion</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="General / OBC / SC / ST" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="previousSchool"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Previous school</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ------------------------------------------------- Emergency contact */}
          <Card>
            <CardHeader>
              <CardTitle>Emergency contact</CardTitle>
              <CardDescription>Who to call first if something happens on campus.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="emergencyContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emergencyContactPhone"
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
                name="emergencyContactRelation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Father" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* --------------------------------------------------------- Addresses */}
          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-4 text-sm font-medium">Permanent address</h3>
                <AddressFields control={form.control} prefix="permanentAddress" />
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="sameAsPermanent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="sameAsPermanent"
                      />
                    </FormControl>
                    <FormLabel htmlFor="sameAsPermanent" className="cursor-pointer font-normal">
                      Current address is the same as the permanent address
                    </FormLabel>
                  </FormItem>
                )}
              />

              {!sameAsPermanent && (
                <div>
                  <h3 className="mb-4 text-sm font-medium">Current address</h3>
                  <AddressFields control={form.control} prefix="currentAddress" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------------------- Guardians */}
          <Card>
            <CardHeader>
              <CardTitle>Guardians</CardTitle>
              <CardDescription>
                A guardian with an email can be given a Parent login to follow this student.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="space-y-5 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Guardian {index + 1}</h3>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.firstName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.lastName`}
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
                      name={`guardians.${index}.relation`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relationship</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {RELATIONS.map((relation) => (
                                <SelectItem key={relation} value={relation}>
                                  {GUARDIAN_RELATION_LABELS[relation]}
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
                      name={`guardians.${index}.phone`}
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
                      name={`guardians.${index}.email`}
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
                      name={`guardians.${index}.occupation`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Occupation</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.aadhaarNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aadhaar number</FormLabel>
                          <FormControl>
                            <Input {...field} inputMode="numeric" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.annualIncome`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Annual income</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                    <FormField
                      control={form.control}
                      name={`guardians.${index}.isPrimary`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                // Only one guardian may be primary.
                                if (checked) {
                                  fields.forEach((_, otherIndex) => {
                                    if (otherIndex !== index) {
                                      form.setValue(`guardians.${otherIndex}.isPrimary`, false);
                                    }
                                  });
                                }
                                field.onChange(checked);
                              }}
                              id={`primary-${index}`}
                            />
                          </FormControl>
                          <FormLabel htmlFor={`primary-${index}`} className="cursor-pointer font-normal">
                            Primary guardian
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`guardians.${index}.createPortalAccount`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              id={`portal-${index}`}
                            />
                          </FormControl>
                          <FormLabel htmlFor={`portal-${index}`} className="cursor-pointer font-normal">
                            Create a Parent login
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}

              {fields.length < 4 && (
                <Button type="button" variant="outline" onClick={() => append(emptyGuardian)}>
                  <Plus className="size-4" aria-hidden />
                  Add another guardian
                </Button>
              )}

              {form.formState.errors.guardians?.root && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.guardians.root.message}
                </p>
              )}
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
                        Activate the student&apos;s login
                      </FormLabel>
                      <FormDescription>
                        A temporary password is generated and emailed. Uncheck to create the record
                        without portal access for now.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/students')}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                  Admitting…
                </>
              ) : (
                <>
                  <UserPlus className="size-4" aria-hidden />
                  Admit student
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
