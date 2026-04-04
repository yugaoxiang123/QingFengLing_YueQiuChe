using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Highlights arrow / load / unload UI Images from input, plays drive + Q/E sounds,
/// and plays an alarm when touching colliders tagged AirWall (trigger or collision).
/// </summary>
public class CarInputUIAndAudioFeedback : MonoBehaviour
{
    [Header("UI - Direction arrows")]
    [SerializeField] private Image arrowUp;
    [SerializeField] private Image arrowDown;
    [SerializeField] private Image arrowLeft;
    [SerializeField] private Image arrowRight;

    [Header("UI - Load / Unload")]
    [SerializeField] private Image loadIndicator;
    [SerializeField] private Image unloadIndicator;

    [Header("UI - Colors")]
    [SerializeField] private Color normalColor = Color.white;
    [SerializeField] private Color highlightColor = new Color(1f, 0.85f, 0.2f, 1f);

    [Header("Audio")]
    [Tooltip("Used for looping drive sound and optional one-shots if SFX source is empty.")]
    [SerializeField] private AudioSource mainAudioSource;
    [Tooltip("Optional separate source for load/unload one-shots so engine loop is never stopped.")]
    [SerializeField] private AudioSource sfxAudioSource;
    [SerializeField] private AudioClip driveLoopClip;
    [SerializeField] private AudioClip loadClip;
    [SerializeField] private AudioClip unloadClip;
    [Tooltip("Engine loop volume at max speed (see drive max speed for volume).")]
    [SerializeField] [Range(0f, 1f)] private float driveVolume = 0.6f;
    [SerializeField] [Range(0f, 1f)] private float sfxVolume = 1f;

    [Header("Drive sound")]
    [SerializeField] private float inputDeadZone = 0.1f;
    [SerializeField] private float driveMinSpeed = 0.08f;
    [Tooltip("If true, drive sound also follows Rigidbody speed (not only input).")]
    [SerializeField] private bool useRigidbodySpeed = true;
    [Tooltip("Volume when speed is ~0 (still playing while driving input / coasting logic applies).")]
    [SerializeField] [Range(0f, 1f)] private float driveMinVolume = 0f;
    [Tooltip("World speed (m/s) at which engine reaches max volume. Tune to your car's typical top speed.")]
    [SerializeField] private float driveMaxSpeedForVolume = 12f;
    [Tooltip("Extra response: final blend = Clamp01(speedBlend * this). 1 = linear with speed.")]
    [SerializeField] private float driveVolumeSpeedScalar = 1f;

    [Header("Air wall alarm")]
    [SerializeField] private string airWallTag = "AirWall";
    [SerializeField] private AudioClip airWallAlarmClip;
    [SerializeField] [Range(0f, 1f)] private float airWallAlarmVolume = 1f;
    [Tooltip("Min seconds between alarm plays (avoids rapid repeats on multi-piece walls).")]
    [SerializeField] private float airWallAlarmCooldown = 0.4f;
    [SerializeField] private bool detectAirWallTrigger = true;
    [Tooltip("Enable if AirWall uses non-trigger colliders (solid walls).")]
    [SerializeField] private bool detectAirWallCollision = false;

    private Rigidbody rb;
    private float lastAirWallAlarmTime = -1000f;
    private int airWallTouchCount;

    private void Awake()
    {
        rb = GetComponent<Rigidbody>();
        if (rb == null)
            rb = GetComponentInParent<Rigidbody>();
        if (mainAudioSource == null)
            mainAudioSource = GetComponent<AudioSource>();
    }

    private void Start()
    {
        ApplyAllNormal();

        if (mainAudioSource != null && driveLoopClip != null)
        {
            mainAudioSource.clip = driveLoopClip;
            mainAudioSource.loop = true;
            mainAudioSource.volume = driveMinVolume;
        }
    }

    private void Update()
    {
        float v = Input.GetAxisRaw("Vertical");
        float h = Input.GetAxisRaw("Horizontal");

        SetHighlighted(arrowUp, v > inputDeadZone);
        SetHighlighted(arrowDown, v < -inputDeadZone);
        SetHighlighted(arrowLeft, h < -inputDeadZone);
        SetHighlighted(arrowRight, h > inputDeadZone);

        SetHighlighted(loadIndicator, Input.GetKey(KeyCode.Q));
        SetHighlighted(unloadIndicator, Input.GetKey(KeyCode.E));

        bool driving = Mathf.Abs(v) > inputDeadZone || Mathf.Abs(h) > inputDeadZone;
        if (useRigidbodySpeed && rb != null && rb.velocity.sqrMagnitude > driveMinSpeed * driveMinSpeed)
            driving = true;

        bool touchingAirWall = airWallTouchCount > 0;
        UpdateDriveAudio(driving, touchingAirWall, v, h);
    }

    public void PlayCargoLoadSound()
    {
        PlayCargoClip(loadClip);
    }

    /// <summary>Call from <see cref="CarWheelController"/> when reset animation is triggered (e.g. zone click guard).</summary>
    public void PlayCargoUnloadSound()
    {
        PlayCargoClip(unloadClip);
    }

    private void PlayCargoClip(AudioClip clip)
    {
        if (clip == null) return;
        AudioSource sfx = sfxAudioSource != null ? sfxAudioSource : mainAudioSource;
        if (sfx == null) return;
        sfx.PlayOneShot(clip, sfxVolume);
    }

    private void SetHighlighted(Image img, bool highlighted)
    {
        if (img == null) return;
        img.color = highlighted ? highlightColor : normalColor;
    }

    private void ApplyAllNormal()
    {
        SetHighlighted(arrowUp, false);
        SetHighlighted(arrowDown, false);
        SetHighlighted(arrowLeft, false);
        SetHighlighted(arrowRight, false);
        SetHighlighted(loadIndicator, false);
        SetHighlighted(unloadIndicator, false);
    }

    private void UpdateDriveAudio(bool shouldPlay, bool touchingAirWall, float verticalInput, float horizontalInput)
    {
        if (mainAudioSource == null || driveLoopClip == null) return;

        if (shouldPlay || touchingAirWall)
        {
            if (!mainAudioSource.isPlaying)
                mainAudioSource.Play();

            float speedBlend = GetDriveVolumeBlend(verticalInput, horizontalInput);
            float t = Mathf.Clamp01(speedBlend * driveVolumeSpeedScalar);
            float vol = Mathf.Lerp(driveMinVolume, driveVolume, t);
            if (touchingAirWall && !shouldPlay)
                vol = Mathf.Max(vol, Mathf.Lerp(driveMinVolume, driveVolume, 0.2f));

            mainAudioSource.volume = vol;
        }
        else
        {
            if (mainAudioSource.isPlaying)
                mainAudioSource.Stop();
        }
    }

    /// <summary>0 = min volume, 1 = max volume, from Rigidbody speed (or input fallback).</summary>
    private float GetDriveVolumeBlend(float verticalInput, float horizontalInput)
    {
        if (rb != null)
        {
            float denom = Mathf.Max(0.001f, driveMaxSpeedForVolume);
            return Mathf.Clamp01(rb.velocity.magnitude / denom);
        }

        float inputMag = Mathf.Max(Mathf.Abs(verticalInput), Mathf.Abs(horizontalInput));
        return Mathf.Clamp01(inputMag);
    }

    private void TryPlayAirWallAlarm()
    {
        if (airWallAlarmClip == null) return;

        if (airWallAlarmCooldown > 0f && Time.time - lastAirWallAlarmTime < airWallAlarmCooldown)
            return;

        lastAirWallAlarmTime = Time.time;

        if (sfxAudioSource != null)
        {
            sfxAudioSource.PlayOneShot(airWallAlarmClip, airWallAlarmVolume);
            return;
        }

        AudioSource.PlayClipAtPoint(airWallAlarmClip, transform.position, airWallAlarmVolume);
    }

    private void OnTriggerEnter(Collider other)
    {
        NotifyAirWallTriggerEnter(other);
    }

    private void OnTriggerExit(Collider other)
    {
        NotifyAirWallTriggerExit(other);
    }

    private void OnCollisionEnter(Collision collision)
    {
        NotifyAirWallCollisionEnter(collision);
    }

    private void OnCollisionExit(Collision collision)
    {
        NotifyAirWallCollisionExit(collision);
    }

    /// <summary>Used by <see cref="CarAirWallContactRelay"/>; tag must be on the same GameObject as the other collider.</summary>
    public void NotifyAirWallTriggerEnter(Collider other)
    {
        if (!detectAirWallTrigger || other == null || !other.CompareTag(airWallTag)) return;
        airWallTouchCount++;
        TryPlayAirWallAlarm();
    }

    public void NotifyAirWallTriggerExit(Collider other)
    {
        if (!detectAirWallTrigger || other == null || !other.CompareTag(airWallTag)) return;
        airWallTouchCount = Mathf.Max(0, airWallTouchCount - 1);
    }

    public void NotifyAirWallCollisionEnter(Collision collision)
    {
        if (!detectAirWallCollision || collision == null || collision.collider == null) return;
        if (!collision.collider.CompareTag(airWallTag)) return;
        airWallTouchCount++;
        TryPlayAirWallAlarm();
    }

    public void NotifyAirWallCollisionExit(Collision collision)
    {
        if (!detectAirWallCollision || collision == null || collision.collider == null) return;
        if (!collision.collider.CompareTag(airWallTag)) return;
        airWallTouchCount = Mathf.Max(0, airWallTouchCount - 1);
    }
}
