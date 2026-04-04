using UnityEngine;

/// <summary>
/// Put this on the <b>same GameObject as the Animator</b> (the object Unity uses to resolve Animation Events).
/// In the Animation / Timeline clip, add an event and pick function <see cref="PlayLoadSound"/> if you drive load SFX from clips.
/// Do <b>not</b> use <see cref="PlayUnloadSound"/> here if <see cref="CarWheelController"/> already plays unload when Animator Reset goes false→true each frame (double sound).
/// </summary>
public class CarAnimatorAudioEvents : MonoBehaviour
{
    [SerializeField] private CarInputUIAndAudioFeedback feedback;

    private void Awake()
    {
        if (feedback == null)
            feedback = GetComponentInParent<CarInputUIAndAudioFeedback>();
        if (feedback == null)
            feedback = GetComponentInChildren<CarInputUIAndAudioFeedback>(true);
    }

    /// <summary>Animation Event: unload / reset cargo SFX.</summary>
    public void PlayUnloadSound()
    {
        if (feedback == null)
            feedback = GetComponentInParent<CarInputUIAndAudioFeedback>();
        feedback?.PlayCargoUnloadSound();
    }

    /// <summary>Animation Event: load cargo SFX (optional; you can keep using code-only load).</summary>
    public void PlayLoadSound()
    {
        if (feedback == null)
            feedback = GetComponentInParent<CarInputUIAndAudioFeedback>();
        feedback?.PlayCargoLoadSound();
    }
}
