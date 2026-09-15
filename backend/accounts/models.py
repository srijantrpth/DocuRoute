import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils.text import slugify


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=190, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @classmethod
    def create_for(cls, name: str) -> "Organization":
        base = slugify(name)[:150] or "workspace"
        slug = base
        suffix = 1
        while cls.objects.filter(slug=slug).exists():
            suffix += 1
            slug = f"{base}-{suffix}"[:190]
        return cls.objects.create(name=name, slug=slug)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not extra.get("is_staff") or not extra.get("is_superuser"):
            raise ValueError("Superuser must have is_staff=True and is_superuser=True.")
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """Local mirror of a Supabase auth user.

    Supabase owns credentials; this row owns organization membership, ownership of
    documents, and anything the audit trail needs to attribute to a person.
    """

    username = None
    first_name = None
    last_name = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=180, blank=True)
    avatar_url = models.URLField(blank=True, max_length=500)
    job_title = models.CharField(max_length=120, blank=True)
    supabase_uid = models.CharField(max_length=64, blank=True, null=True, unique=True, db_index=True)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="members", null=True, blank=True
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email

    @property
    def display_name(self) -> str:
        return self.full_name or self.email.split("@")[0]

    @property
    def initials(self) -> str:
        parts = [p for p in self.display_name.replace(".", " ").split() if p]
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return (parts[0][:2] if parts else "?").upper()

    def ensure_organization(self) -> Organization:
        if self.organization_id is None:
            domain = self.email.split("@")[-1].split(".")[0].title()
            self.organization = Organization.create_for(f"{domain} Workspace")
            self.save(update_fields=["organization"])
        return self.organization
