using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// When the car enters colliders/triggers tagged AirWall, fades in a boundary UI; fades out when no longer touching.
/// Attach to the same GameObject as the car's Rigidbody (or any object that moves with the car and has the trigger/collision).
/// Prefer assigning a CanvasGroup on the boundary UI for fading; otherwise an Image alpha is lerped.
/// </summary>
public class AirWallBoundaryFade : MonoBehaviour
{
    [Header("Boundary UI (pick one)")]
    [SerializeField] private CanvasGroup boundaryCanvasGroup;
    [SerializeField] private Image boundaryImage;

    [Header("Air wall")]
    [SerializeField] private string airWallTag = "AirWall";
    [SerializeField] private float fadeSpeed = 2.5f;
    [Tooltip("Use when air walls use Is Trigger colliders.")]
    [SerializeField] private bool detectTrigger = true;
    [Tooltip("Use when air walls are non-trigger colliders.")]
    [SerializeField] private bool detectCollision = false;

    private int overlapCount;
    private float targetImageAlpha = 1f;

    private void Start()
    {
        if (boundaryImage != null)
            targetImageAlpha = boundaryImage.color.a;

        SetAlphaImmediate(0f);
    }

    private void Update()
    {
        float target = overlapCount > 0 ? 1f : 0f;
        float step = fadeSpeed * Time.deltaTime;

        if (boundaryCanvasGroup != null)
        {
            boundaryCanvasGroup.alpha = Mathf.MoveTowards(boundaryCanvasGroup.alpha, target, step);
        }
        else if (boundaryImage != null)
        {
            Color c = boundaryImage.color;
            float nextA = Mathf.MoveTowards(c.a, target * targetImageAlpha, step);
            c.a = nextA;
            boundaryImage.color = c;
        }
    }

    private void SetAlphaImmediate(float normalizedAlpha)
    {
        normalizedAlpha = Mathf.Clamp01(normalizedAlpha);

        if (boundaryCanvasGroup != null)
        {
            boundaryCanvasGroup.alpha = normalizedAlpha;
        }
        else if (boundaryImage != null)
        {
            Color c = boundaryImage.color;
            c.a = normalizedAlpha * targetImageAlpha;
            boundaryImage.color = c;
        }
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
        if (!detectTrigger || other == null || !other.CompareTag(airWallTag)) return;
        overlapCount++;
    }

    public void NotifyAirWallTriggerExit(Collider other)
    {
        if (!detectTrigger || other == null || !other.CompareTag(airWallTag)) return;
        overlapCount = Mathf.Max(0, overlapCount - 1);
    }

    public void NotifyAirWallCollisionEnter(Collision collision)
    {
        if (!detectCollision || collision == null || collision.collider == null) return;
        if (!collision.collider.CompareTag(airWallTag)) return;
        overlapCount++;
    }

    public void NotifyAirWallCollisionExit(Collision collision)
    {
        if (!detectCollision || collision == null || collision.collider == null) return;
        if (!collision.collider.CompareTag(airWallTag)) return;
        overlapCount = Mathf.Max(0, overlapCount - 1);
    }
}
